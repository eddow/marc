import console from 'node:console'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HttpBindings, ServerType } from '@hono/node-server'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { type Context, Hono } from 'hono'
import type { MarcConfig } from './config.js'
import { marcHttpUrl } from './config.js'
import { clearDaemonState, writeDaemonState } from './runtime.js'
import {
	allMessages,
	type Briefing,
	createShellChannel,
	deleteChannel,
	deleteShellChannel,
	dismiss,
	errata,
	getAllChannels,
	getBriefing,
	getMcpAgents,
	getShellChannel,
	getTopic,
	getUsers,
	init,
	isJoined,
	join as joinChannel,
	listShellChannels,
	type Message,
	part,
	post,
	resolveAgent,
	restartShellChannel,
	type ShellChannel,
	search,
	sendShellInput,
	setAgentName,
	setBriefing,
	setDataDir,
	setTopic,
	shutdown,
	startShellChannel,
	stopShellChannel,
	storeEvents,
	sync as storeSync,
	type Topic,
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

const responseAlreadySent = new Response(null, {
	headers: { 'x-hono-already-sent': 'true' },
})

interface LegacySseTransport {
	close(): Promise<void>
	handlePostMessage(
		incoming: HttpBindings['incoming'],
		outgoing: HttpBindings['outgoing'],
		message: unknown
	): Promise<void>
}

function staticRoot(): string {
	const dir = dirname(fileURLToPath(import.meta.url))
	return basename(dir) === 'server' ? resolve(dir, '../dist') : dir
}

function indexHtmlPath(): string {
	return join(staticRoot(), 'index.html')
}

/** True if the POST body is a JSON-RPC initialize (single or batch). Stale `mcp-session-id` must not block this. */
function bodyIncludesInitialize(body: unknown): boolean {
	if (Array.isArray(body)) {
		return body.some((m) => isInitializeRequest(m))
	}
	return isInitializeRequest(body)
}

/** Client-side routes (e.g. /stream) after static misses: serve the SPA shell. */
function spaFallbackResponse(c: Context) {
	const method = c.req.method
	if (method !== 'GET' && method !== 'HEAD') {
		return c.text('Not Found', 404)
	}
	const accept = c.req.header('Accept') ?? ''
	if (!accept.includes('text/html')) {
		return c.text('Not Found', 404)
	}
	const pathname = new URL(c.req.url).pathname
	const leaf = pathname.split('/').pop() ?? ''
	if (leaf.includes('.') && !leaf.endsWith('.html')) {
		return c.text('Not Found', 404)
	}
	const path = indexHtmlPath()
	if (!existsSync(path)) {
		return c.text('Not Found', 404)
	}
	const html = readFileSync(path, 'utf-8')
	if (method === 'HEAD') {
		const body = new TextEncoder().encode(html)
		return new Response(null, {
			status: 200,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Content-Length': String(body.byteLength),
			},
		})
	}
	return c.html(html)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

async function requestBody(c: Context): Promise<unknown> {
	return c.req.json<unknown>()
}

function stringField(body: unknown, key: string): string | null {
	if (!isRecord(body)) return null
	const value = body[key]
	return typeof value === 'string' ? value : null
}

function messageTypeField(body: unknown): Message['type'] {
	const value = isRecord(body) ? body.type : undefined
	if (
		value === 'text' ||
		value === 'action' ||
		value === 'join' ||
		value === 'part' ||
		value === 'shell' ||
		value === 'shell-output' ||
		value === 'shell-error' ||
		value === 'shell-status'
	) {
		return value
	}
	return 'text'
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
			return result.ok
				? jsonResult({ ok: true, name: result.name })
				: errResult(result.error ?? 'Unknown error')
		},
		join: ({ agentId, target }) => {
			const name = resolveAgent(agentId)
			return name ? jsonResult(joinChannel(name, target)) : unknownAgentResult()
		},
		post: ({ agentId, target, message, type }) => {
			const name = resolveAgent(agentId)
			if (!name) return unknownAgentResult()
			const joined = target.startsWith('#') && !isJoined(name, target)
			if (joined) joinChannel(name, target)
			const id = post(name, target, message, type)
			return textResult(joined ? `Joined ${target}. Sent. (id: ${id})` : `Sent. (id: ${id})`)
		},
		part: ({ agentId, target }) => {
			const name = resolveAgent(agentId)
			if (!name) return unknownAgentResult()
			part(name, target)
			return textResult(`Left ${target}`)
		},
		users: ({ target }) => jsonResult(getUsers(target)),
		errata: ({ messageId, newMessage }) =>
			textResult(errata(messageId, newMessage) ? 'Updated.' : 'Message not found.'),
		setTopic: ({ agentId, target, topic }) => {
			const name = resolveAgent(agentId)
			return name ? jsonResult(setTopic(name, target, topic)) : unknownAgentResult()
		},
		search: ({ query, target, sender, limit }) =>
			jsonResult(search(query, { target, sender, limit })),
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
	const sseTransports: Record<string, LegacySseTransport> = {}

	app.get('/healthz', (c) =>
		c.json({
			ok: true,
			version: marcServerInfo.version,
			host: config.host,
			port: config.port,
		})
	)

	// Manual API routes to bypass board middleware type issues
	app.get('/api/messages', async (c) => {
		const messages = allMessages()
		return c.json(messages)
	})

	app.get('/api/agents', async (c) => {
		const agents = getMcpAgents()
		return c.json(agents)
	})

	app.post('/api/post', async (c) => {
		const body = await requestBody(c)
		const name = stringField(body, 'name')
		const target = stringField(body, 'target')
		const message = stringField(body, 'message')
		if (!name || !target || !message) {
			return c.json({ error: 'Missing name, target, or message' }, 400)
		}
		return c.json({ ok: true, id: post(name, target, message, messageTypeField(body)) })
	})

	app.post('/api/join', async (c) => {
		const body = await requestBody(c)
		const name = stringField(body, 'name')
		const target = stringField(body, 'target')
		if (!name || !target) return c.json({ error: 'Missing name or target' }, 400)
		joinChannel(name, target)
		return c.json({ ok: true })
	})

	app.post('/api/part', async (c) => {
		const body = await requestBody(c)
		const name = stringField(body, 'name')
		const target = stringField(body, 'target')
		if (!name || !target) return c.json({ error: 'Missing name or target' }, 400)
		part(name, target)
		return c.json({ ok: true })
	})

	app.post('/api/dismiss', async (c) => {
		const body = await requestBody(c)
		const name = stringField(body, 'name')
		if (!name) return c.json({ error: 'Missing name' }, 400)
		dismiss(name)
		return c.json({ ok: true })
	})

	app.post('/api/errata', async (c) => {
		const body = await requestBody(c)
		const newMessage = stringField(body, 'newMessage')
		const messageId = isRecord(body) ? body.messageId : undefined
		if (typeof messageId !== 'number' || !newMessage) {
			return c.json({ error: 'Missing messageId or newMessage' }, 400)
		}
		return c.json({ ok: errata(messageId, newMessage) })
	})

	app.get('/api/briefing', async (c) => c.json(getBriefing()))

	app.post('/api/briefing', async (c) => {
		const body = await requestBody(c)
		const text = stringField(body, 'text')
		if (text === null) return c.json({ error: 'Missing text' }, 400)
		return c.json({ ok: true, briefing: setBriefing(text) })
	})

	app.post('/api/channels/delete', async (c) => {
		const body = await requestBody(c)
		const name = stringField(body, 'name')
		if (!name) return c.json({ error: 'Missing channel name' }, 400)
		deleteChannel(name)
		return c.json({ ok: true })
	})

	app.get('/api/users/:target', async (c) => {
		const target = c.req.param('target')
		return c.json(getUsers(target))
	})

	app.get('/api/topic/:target', async (c) => c.json(getTopic(c.req.param('target'))))

	app.post('/api/topic', async (c) => {
		const body = await requestBody(c)
		const target = stringField(body, 'target')
		const topic = stringField(body, 'topic')
		const name = stringField(body, 'name') ?? 'human'
		if (!target || topic === null) return c.json({ error: 'Missing target or topic' }, 400)
		return c.json({ ok: true, topic: setTopic(name, target, topic) })
	})

	app.get('/api/shell-channels', async (c) => c.json(listShellChannels()))

	app.post('/api/shell-channels', async (c) => {
		const body = await requestBody(c)
		const name = stringField(body, 'name')
		const cwd = stringField(body, 'cwd')
		const command = stringField(body, 'command')
		const user = stringField(body, 'user')
		if (!name || !cwd || !command || !user) {
			return c.json({ error: 'Missing name, cwd, command, or user' }, 400)
		}
		const result = createShellChannel({ name, cwd, command, createdBy: user })
		if (!result.ok) return c.json({ error: result.error }, 400)
		return c.json({ ok: true, channel: result.channel })
	})

	app.get('/api/shell-channels/:name', async (c) => c.json(getShellChannel(c.req.param('name'))))

	app.delete('/api/shell-channels/:name', async (c) => {
		const name = c.req.param('name')
		if (!deleteShellChannel(name)) return c.json({ error: `Unknown shell channel: ${name}` }, 404)
		return c.json({ ok: true })
	})

	app.post('/api/shell-channels/:name/start', async (c) => {
		const body = await requestBody(c)
		const user = stringField(body, 'user')
		if (!user) return c.json({ error: 'Missing user' }, 400)
		const result = startShellChannel(c.req.param('name'), user)
		if (!result.ok) return c.json({ error: result.error }, 400)
		return c.json({ ok: true, channel: result.channel })
	})

	app.post('/api/shell-channels/:name/stop', async (c) => {
		const body = await requestBody(c)
		const user = stringField(body, 'user')
		if (!user) return c.json({ error: 'Missing user' }, 400)
		const result = stopShellChannel(c.req.param('name'), user)
		if (!result.ok) return c.json({ error: result.error }, 400)
		return c.json({ ok: true })
	})

	app.post('/api/shell-channels/:name/restart', async (c) => {
		const body = await requestBody(c)
		const user = stringField(body, 'user')
		if (!user) return c.json({ error: 'Missing user' }, 400)
		const result = await restartShellChannel(c.req.param('name'), user)
		if (!result.ok) return c.json({ error: result.error }, 400)
		return c.json({ ok: true, channel: result.channel })
	})

	app.post('/api/shell-channels/:name/input', async (c) => {
		const body = await requestBody(c)
		const input = stringField(body, 'input')
		if (input === null) return c.json({ error: 'Missing input' }, 400)
		const result = sendShellInput(c.req.param('name'), input)
		if (!result.ok) return c.json({ error: result.error }, 400)
		return c.json({ ok: true })
	})

	app.get('/api/stream', async (_c) => {
		const stream = new ReadableStream({
			start(controller) {
				const send = <Data>(data: Data) => {
					try {
						const payload = `data: ${JSON.stringify(data)}\n\n`
						controller.enqueue(new TextEncoder().encode(payload))
					} catch (_) {
						// Ignored if controller is closed
					}
				}

				// Initial snapshots
				send({ type: 'messages', data: allMessages() })
				send({ type: 'agents', data: getMcpAgents() })
				send({ type: 'shellChannels', data: listShellChannels() })

				// Event listeners
				const onMessage = (message: Message) => {
					send({ type: 'message', data: message })
				}
				const onAgents = (agentList: ReturnType<typeof getMcpAgents>) => {
					send({ type: 'agents', data: agentList })
				}
				const onShellChannels = (shellChannels: ShellChannel[]) => {
					send({ type: 'shellChannels', data: shellChannels })
				}
				const onTopic = (ev: { target: string; topic: Topic }) => {
					send({ type: 'topic', ...ev })
				}
				const onBriefing = (briefing: Briefing) => {
					send({ type: 'briefing', briefing })
				}
				const onChannelDeleted = (target: string) => {
					send({ type: 'channelDeleted', target })
				}

				// Register event listeners
				storeEvents.on('message', onMessage)
				storeEvents.on('agents', onAgents)
				storeEvents.on('shellChannels', onShellChannels)
				storeEvents.on('topic', onTopic)
				storeEvents.on('briefing', onBriefing)
				storeEvents.on('channelDeleted', onChannelDeleted)

				// Cleanup function
				return () => {
					storeEvents.off('message', onMessage)
					storeEvents.off('agents', onAgents)
					storeEvents.off('shellChannels', onShellChannels)
					storeEvents.off('topic', onTopic)
					storeEvents.off('briefing', onBriefing)
					storeEvents.off('channelDeleted', onChannelDeleted)
				}
			},
		})

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
		})
	})

	app.all('/mcp', async (c) => {
		const req = c.req.raw
		const sessionId = req.headers.get('mcp-session-id') || undefined
		try {
			if (!sessionId && req.method === 'GET') {
				return new Response(null, {
					status: 405,
					headers: { Allow: 'POST, DELETE' },
				})
			}
			let transport = sessionId ? transports[sessionId] : undefined
			let parsedBody: unknown
			if (req.method === 'POST') parsedBody = await req.clone().json()
			if (!transport) {
				// Let clients clear a stale session id (SDK skips re-init while transport.sessionId is set)
				if (req.method === 'DELETE') {
					return new Response(null, { status: 200 })
				}
				const openingSession = req.method === 'POST' && bodyIncludesInitialize(parsedBody)
				if (!openingSession) {
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
			return await transport.handleRequest(
				req,
				parsedBody === undefined ? undefined : { parsedBody }
			)
		} catch (error) {
			console.error('MCP error:', error)
			return c.json(
				{ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null },
				500
			)
		}
	})

	app.get('/sse', async (_c) => {
		// Create a proper SSE response
		const stream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder()

				// Send the endpoint message first
				const sessionId = randomUUID()
				const endpointData = `event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`
				controller.enqueue(encoder.encode(endpointData))

				// Store the session for the message endpoint
				const transport: LegacySseTransport = {
					close: async () => {},
					handlePostMessage: async (_incoming, _outgoing, message) => {
						// This would need to be implemented properly
						console.log('[SSE] Received message:', message)
					},
				}
				sseTransports[sessionId] = transport

				// Cleanup on connection close
				return () => {
					delete sseTransports[sessionId]
				}
			},
		})

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Cache-Control',
			},
		})
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

	// Built dashboard assets; then SPA shell for HTML navigations (e.g. /stream)
	app.use('/*', serveStatic({ root: staticRoot() }))
	app.all('*', (c) => spaFallbackResponse(c))

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
				if (
					error &&
					(!(error instanceof Error) ||
						!('code' in error) ||
						error.code !== 'ERR_SERVER_NOT_RUNNING')
				) {
					reject(error)
					return
				} else resolveClose()
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
