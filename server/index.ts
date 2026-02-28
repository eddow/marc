import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createPounceMiddleware } from 'board/server'
import { Hono } from 'hono'
import { z } from 'zod'
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
	setTopic,
	sync as storeSync,
	welcome,
} from './store.js'

init()

const app = new Hono()
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001

// Serve built dashboard from dist/ (same level as server/)
app.use('/*', serveStatic({ root: './dist' }))

// --- MCP Server Setup ---

const ERR_NO_ID = 'Unknown agentId. Call sync() without agentId first.'
const textResult = (text: string) => ({ content: [{ type: 'text' as const, text }] })
const jsonResult = (obj: unknown) => textResult(JSON.stringify(obj))
const errResult = (msg: string) => ({
	content: [{ type: 'text' as const, text: msg }],
	isError: true as const,
})

const requireAgent = (agentId: string): string | null => resolveAgent(agentId)

const getServer = () => {
	const server = new McpServer(
		{ name: 'marc', version: '1.0.0' },
		{ capabilities: { logging: {} } }
	)

	server.registerTool(
		'sync',
		{
			description:
				'IMPORTANT: Call this FIRST on session start. Syncs you with the server. First call (omit agentId): assigns your unique agentId and delivers the operator briefing. Use this agentId in ALL subsequent tool calls. Do NOT store agentId in persistent memory. Subsequent calls: returns unread messages, changed topics, and briefing updates since last sync.',
			inputSchema: { agentId: z.string().optional() },
			annotations: { readOnlyHint: false },
		},
		async ({ agentId }) => {
			let name: string | null
			let assignedId: string | undefined
			if (!agentId) {
				const w = welcome()
				assignedId = w.agentId
				name = resolveAgent(assignedId)
			} else {
				name = requireAgent(agentId)
				if (!name) {
					// Agent provided an unknown id (e.g. their own name) — register them
					const w = welcome()
					assignedId = w.agentId
					// Try to use the provided agentId as display name
					setAgentName(assignedId, agentId)
					name = resolveAgent(assignedId)
				}
			}
			const news = storeSync(name!)
			if (assignedId) return jsonResult({ agentId: assignedId, ...news })
			return jsonResult(news)
		}
	)

	server.registerTool(
		'setName',
		{
			description:
				'Set your display name. Names must be unique. Before calling this, you appear as "anon-<id>".',
			inputSchema: { agentId: z.string(), name: z.string() },
			annotations: { readOnlyHint: false },
		},
		async ({ agentId, name }) => {
			const result = setAgentName(agentId, name)
			if (!result.ok) return errResult(result.error!)
			return jsonResult({ ok: true, name: result.name })
		}
	)

	server.registerTool(
		'join',
		{
			description:
				'Join a channel (starting with #). Returns { history: Message[], topic: Topic | null }.',
			inputSchema: { agentId: z.string(), target: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ agentId, target }) => {
			const name = requireAgent(agentId)
			if (!name) return errResult(ERR_NO_ID)
			const result = join(name, target)
			return jsonResult(result)
		}
	)

	server.registerTool(
		'post',
		{
			description:
				'Post a message to a channel (starting with #) or as a DM to a specific agent (user name). Set type to "action" for /me-style messages (e.g. "waves hello" renders as "* AgentName waves hello").',
			inputSchema: {
				agentId: z.string(),
				target: z.string(),
				message: z.string(),
				type: z.enum(['text', 'action']).optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ agentId, target, message, type }) => {
			const name = requireAgent(agentId)
			if (!name) return errResult(ERR_NO_ID)
			const id = post(name, target, message, type)
			return textResult(`Sent. (id: ${id})`)
		}
	)

	server.registerTool(
		'part',
		{
			description: 'Leave a channel (starting with #)',
			inputSchema: { agentId: z.string(), target: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ agentId, target }) => {
			const name = requireAgent(agentId)
			if (!name) return errResult(ERR_NO_ID)
			part(name, target)
			return textResult(`Left ${target}`)
		}
	)

	server.registerTool(
		'users',
		{
			description: 'Get a list of agents in a channel with their last update timestamps',
			inputSchema: { target: z.string() },
			annotations: { readOnlyHint: true },
		},
		async ({ target }) => {
			const users = getUsers(target)
			return jsonResult(users)
		}
	)

	server.registerTool(
		'errata',
		{
			description: 'Edit a previously posted message by its ID',
			inputSchema: { messageId: z.number(), newMessage: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ messageId, newMessage }) => {
			const ok = errata(messageId, newMessage)
			return textResult(ok ? 'Updated.' : 'Message not found.')
		}
	)

	server.registerTool(
		'setTopic',
		{
			description:
				'Set the topic of a channel. The topic is a persistent sticky text shown to all agents on join and reported via sync when changed.',
			inputSchema: { agentId: z.string(), target: z.string(), topic: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ agentId, target, topic }) => {
			const name = requireAgent(agentId)
			if (!name) return errResult(ERR_NO_ID)
			const result = setTopic(name, target, topic)
			return jsonResult(result)
		}
	)

	server.registerTool(
		'search',
		{
			description:
				'Search messages with flexible filters. Returns newest matches first.\n' +
				'Examples:\n' +
				'- Search by text: {query: "hello"}\n' +
				'- Search by sender only: {sender: "username"}\n' +
				'- Search in channel: {target: "#general", query: "todo"}\n' +
				'- Combined: {query: "error", sender: "bot", target: "#logs"}',
			inputSchema: {
				query: z.string().optional().describe('Full-text search in message content'),
				target: z.string().optional().describe('Filter by channel or DM target'),
				sender: z.string().optional().describe('Filter by message sender (username)'),
				limit: z.number().optional().describe('Maximum results (default: 20)'),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ query, target, sender, limit }) => {
			const results = search(query, { target, sender, limit })
			return jsonResult(results)
		}
	)

	server.registerTool(
		'list_channels',
		{
			description: 'List all available channels with their topics.',
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		async () => {
			return jsonResult(getAllChannels())
		}
	)

	// Note: 'context' tool removed from mcp for brevity.

	return server
}

// --- Dashboard API (Board Integration) ---

// Mount the route definitions exported as standard file-based APIs
// Board middleware is cast through unknown to bridge the Hono Context generic
// mismatch between linked packages (marc's hono vs board's hono).
// At runtime the types are structurally identical — this is purely a TS artifact.
const boardMiddleware = createPounceMiddleware({
	routesDir: resolve(dirname(fileURLToPath(import.meta.url)), './routes'),
}) as unknown as Parameters<typeof app.use>[0]
app.use(boardMiddleware)

// --- MCP Transport ---

const transports: Record<string, StreamableHTTPServerTransport> = {}

app.post('/mcp', async (c) => {
	const req = c.req.raw
	// @ts-expect-error - hono node adapter attaches standard res
	const res = c.env?.res || c.res

	const sessionId = req.headers.get('mcp-session-id') || undefined
	try {
		let transport: StreamableHTTPServerTransport

		if (sessionId && transports[sessionId]) {
			transport = transports[sessionId]
		} else if (!sessionId && isInitializeRequest(await req.clone().json())) {
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (sid) => {
					transports[sid] = transport
				},
			})
			transport.onclose = () => {
				const sid = transport.sessionId
				if (sid) delete transports[sid]
			}
			const server = getServer()
			await server.connect(transport)
		} else {
			return c.json(
				{
					jsonrpc: '2.0',
					error: { code: -32000, message: 'Invalid session' },
					id: null,
				},
				400
			)
		}

		await transport.handleRequest(req as any, res as any, await req.json())
		return new Response(null, { status: 200 }) // Signal complete to Hono if response was handled directly
	} catch (error) {
		console.error('MCP error:', error)
		return c.json(
			{
				jsonrpc: '2.0',
				error: { code: -32603, message: 'Internal error' },
				id: null,
			},
			500
		)
	}
})

app.get('/mcp', async (c) => {
	const req = c.req.raw
	// @ts-expect-error
	const res = c.env?.res || c.res
	const sessionId = req.headers.get('mcp-session-id') || undefined

	if (!sessionId || !transports[sessionId]) {
		return c.text('Invalid or missing session ID', 400)
	}
	await transports[sessionId].handleRequest(req as any, res as any)
	return new Response(null, { status: 200 })
})

app.delete('/mcp', async (c) => {
	const req = c.req.raw
	// @ts-expect-error
	const res = c.env?.res || c.res
	const sessionId = req.headers.get('mcp-session-id') || undefined

	if (!sessionId || !transports[sessionId]) {
		return c.text('Invalid or missing session ID', 400)
	}
	await transports[sessionId].handleRequest(req as any, res as any)
	return new Response(null, { status: 200 })
})

process.on('SIGINT', async () => {
	for (const sid in transports) {
		await transports[sid].close()
		delete transports[sid]
	}
	process.exit(0)
})

const sseTransports: Record<string, SSEServerTransport> = {}

// --- SSE Transport for MCP clients that require it ---
app.get('/sse', async (c) => {
	// @ts-expect-error
	const res = c.env?.res || c.res
	const transport = new SSEServerTransport('/message', res as any)
	const server = getServer()
	await server.connect(transport)

	const sid = transport.sessionId
	sseTransports[sid] = transport
	transport.onclose = () => {
		delete sseTransports[sid]
	}
	return new Response(null, { status: 200 })
})

app.post('/message', async (c) => {
	const req = c.req.raw
	// @ts-expect-error
	const res = c.env?.res || c.res
	const url = new URL(req.url)
	const sid = url.searchParams.get('sessionId')

	if (!sid) return c.text('Session not found', 404)

	const transport = sseTransports[sid]
	if (!transport) return c.text('Session not found', 404)

	await transport.handlePostMessage(req as any, res as any, await req.json())
	return new Response(null, { status: 200 })
})

// --- Server Listen ---
serve(
	{
		fetch: app.fetch,
		port,
	},
	(info) => {
		console.log(`mARC unified server (Hono Board + MCP) listening on http://localhost:${info.port}`)
		console.log(`- Dashboard API: http://localhost:${info.port}/api/`)
		console.log(`- Dashboard UI:  http://localhost:${info.port}/`)
		console.log(`- MCP HTTP:      http://localhost:${info.port}/mcp`)
		console.log(`- MCP SSE:       http://localhost:${info.port}/sse`)
	}
)
