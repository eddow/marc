import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HttpBindings, ServerType } from '@hono/node-server'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createPounceMiddleware } from 'board/server'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MarcConfig } from './config.js'
import { marcHttpUrl } from './config.js'
import { clearDaemonState, writeDaemonState } from './runtime.js'
import {
	errata,
	getAllChannels,
	getUsers,
	init,
	join,
	part,
	post,
	resolveAgent,
	search,
	setAgentName,
	setDataDir,
	setTopic,
	shutdown,
	sync as storeSync,
	welcome,
} from './store.js'
import {
	errResult,
	jsonResult,
	marcServerInfo,
	registerMarcTools,
	textResult,
	unknownAgentResult,
} from './tools.js'
import console from 'node:console'
import { connect } from 'node:http2'

const responseAlreadySent = new Response(null, {
	headers: { 'x-hono-already-sent': 'true' },
})

function staticRoot(): string {
	const dir = dirname(fileURLToPath(import.meta.url))
	return basename(dir) === 'server' ? resolve(dir, '../dist') : dir
}

function routesDir(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), './routes')
}

function createMarcMcpServer(): McpServer {
	const server = new McpServer(marcServerInfo, { capabilities: { logging: {} } })
	registerMarcTools(server, {
		sync: ({ agentId }) => {
			let name: string | null
			let assignedId: string | undefined
			if (!agentId) {
				const welcomeResult = welcome()
				assignedId = welcomeResult.agentId
				name = resolveAgent(assignedId)
			} else {
				name = resolveAgent(agentId)
				if (!name) {
					const welcomeResult = welcome()
					assignedId = welcomeResult.agentId
					const renamed = setAgentName(assignedId, agentId)
					if (!renamed.ok) return errResult(renamed.error ?? 'Unable to restore agent identity')
					name = resolveAgent(assignedId)
				}
			}
			if (!name) return errResult('Unable to resolve agent identity')
			const news = storeSync(name)
			return assignedId ? jsonResult({ agentId: assignedId, ...news }) : jsonResult(news)
		},
		setName: ({ agentId, name }) => {
			const result = setAgentName(agentId, name)
			return result.ok ? jsonResult({ ok: true, name: result.name }) : errResult(result.error ?? 'Unknown error')
		},
		join: ({ agentId, target }) => {
			const name = resolveAgent(agentId)
			return name ? jsonResult(join(name, target)) : unknownAgentResult()
		},
		post: ({ agentId, target, message, type }) => {
			const name = resolveAgent(agentId)
			if (!name) return unknownAgentResult()
			const id = post(name, target, message, type)
			return textResult(`Sent. (id: ${id})`)
		},
		part: ({ agentId, target }) => {
			const name = resolveAgent(agentId)
			if (!name) return unknownAgentResult()
			part(name, target)
			return textResult(`Left ${target}`)
		},
		users: ({ target }) => jsonResult(getUsers(target)),
		errata: ({ messageId, newMessage }) => textResult(errata(messageId, newMessage) ? 'Updated.' : 'Message not found.'),
		setTopic: ({ agentId, target, topic }) => {
			const name = resolveAgent(agentId)
			return name ? jsonResult(setTopic(name, target, topic)) : unknownAgentResult()
		},
		search: ({ query, target, sender, limit }) => jsonResult(search(query, { target, sender, limit })),
		listChannels: () => jsonResult(getAllChannels()),
	})
	return server
}

export interface StartedMarcDaemon {
	close(): Promise<void>
	server: ServerType
}

export async function startMarcDaemon(config: MarcConfig): Promise<StartedMarcDaemon> {
	setDataDir(config.dataDir)
	init()
	const app = new Hono<{ Bindings: HttpBindings }>()
	const transports: Record<string, WebStandardStreamableHTTPServerTransport> = {}
	const sseTransports: Record<string, SSEServerTransport> = {}

	app.get('/healthz', (c) =>
		c.json({
			ok: true,
			version: marcServerInfo.version,
			host: config.host,
			port: config.port,
		})
	)
	app.use('/*', serveStatic({ root: staticRoot() }))
	const boardMiddleware = createPounceMiddleware({ routesDir: routesDir() }) as unknown as Parameters<
		typeof app.use
	>[0]
	app.use(boardMiddleware)

	app.all('/mcp', async (c) => {
		const req = c.req.raw
		const sessionId = req.headers.get('mcp-session-id') || undefined
		try {
			let transport = sessionId ? transports[sessionId] : undefined
			let parsedBody: unknown
			if (req.method === 'POST') parsedBody = await req.clone().json()
			if (!transport) {
				if (req.method !== 'POST' || sessionId || !isInitializeRequest(parsedBody)) {
					return c.json(
						{ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid session' }, id: null },
						400
					)
				}
				let createdTransport!: WebStandardStreamableHTTPServerTransport
				createdTransport = new WebStandardStreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					onsessioninitialized: (sid) => {
						transports[sid] = createdTransport
					},
					onsessionclosed: (sid) => {
						delete transports[sid]
					},
				})
				createdTransport.onclose = () => {
					const sid = createdTransport.sessionId
					if (sid) delete transports[sid]
				}
				const server = createMarcMcpServer()
				await server.connect(createdTransport)
				transport = createdTransport
			}
			return await transport.handleRequest(req, parsedBody === undefined ? undefined : { parsedBody })
		} catch (error) {
			console.error('MCP error:', error)
			return c.json(
				{ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null },
				500
			)
		}
	})

	app.get('/sse', async (c) => {
		const transport = new SSEServerTransport('/message', c.env.outgoing)
		const server = createMarcMcpServer()
		await server.connect(transport)
		const sessionId = transport.sessionId
		sseTransports[sessionId] = transport
		transport.onclose = () => {
			delete sseTransports[sessionId]
		}
		await transport.start()
		return responseAlreadySent
	})

	app.post('/message', async (c) => {
		const url = new URL(c.req.url)
		const sessionId = url.searchParams.get('sessionId')
		if (!sessionId) return c.text('Session not found', 404)
		const transport = sseTransports[sessionId]
		if (!transport) return c.text('Session not found', 404)
		await transport.handlePostMessage(c.env.incoming, c.env.outgoing, await c.req.json())
		return responseAlreadySent
	})

	let closing = false
	const server = serve(
		{
			fetch: app.fetch,
			hostname: config.host,
			port: config.port,
		},
		(info) => {
			writeDaemonState({
				pid: process.pid,
				host: config.host,
				port: info.port,
				startedAt: Date.now(),
				dataDir: config.dataDir,
			})
			console.log(`mARC unified server listening on ${marcHttpUrl(config)}`)
			console.log(`- Dashboard API: ${marcHttpUrl(config)}/api/`)
			console.log(`- Dashboard UI:  ${marcHttpUrl(config)}/`)
			console.log(`- MCP HTTP:      ${marcHttpUrl(config)}/mcp`)
			console.log(`- MCP SSE:       ${marcHttpUrl(config)}/sse`)
		}
	)

	const close = async () => {
		if (closing) return
		closing = true
		for (const sessionId in transports) {
			await transports[sessionId].close()
			delete transports[sessionId]
		}
		for (const sessionId in sseTransports) {
			await sseTransports[sessionId].close()
			delete sseTransports[sessionId]
		}
		await shutdown()
		clearDaemonState()
		await new Promise<void>((resolveClose, reject) => {
			server.close((error) => {
				if (error) reject(error)
				else resolveClose()
			})
		})
	}

	process.once('SIGINT', () => {
		void close().finally(() => process.exit(0))
	})
	process.once('SIGTERM', () => {
		void close().finally(() => process.exit(0))
	})

	return { close, server }
}
