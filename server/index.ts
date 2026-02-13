import express from 'express'
import cors from 'cors'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { init, post, errata, allMessages, messagesForTarget, getNews, join, part, dismiss, deleteChannel, getUsers, getAllAgents, context, search, setTopic, getTopic, getBriefing, setBriefing, setDataDir } from './store.js'

init()

const app = express()
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
app.use(express.json())
app.use(cors({ origin: true }))
// Serve built dashboard from dist/ (same level as server/)
app.use(express.static(resolve(dirname(fileURLToPath(import.meta.url)), '../dist')))

// --- MCP Server Setup ---

const getServer = () => {
	const server = new McpServer(
		{ name: 'marc', version: '1.0.0' },
		{ capabilities: { logging: {} } },
	)

	server.registerTool('post', {
		description: 'Post a message to a channel (starting with #) or as a DM to a specific agent (user name). Set type to "action" for /me-style messages (e.g. "waves hello" renders as "* AgentName waves hello").',
		inputSchema: { name: z.string(), target: z.string(), message: z.string(), type: z.enum(['text', 'action']).optional() },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ name, target, message, type }) => {
		const id = post(name, target, message, type)
		return { content: [{ type: 'text' as const, text: `Sent. (id: ${id})` }] }
	})

	server.registerTool('join', {
		description: 'Join a channel (starting with #). Returns { history: Message[], topic: Topic | null }.',
		inputSchema: { name: z.string(), target: z.string() },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ name, target }) => {
		const result = join(name, target)
		return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
	})

	server.registerTool('part', {
		description: 'Leave a channel (starting with #)',
		inputSchema: { name: z.string(), target: z.string() },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ name, target }) => {
		part(name, target)
		return { content: [{ type: 'text' as const, text: `Left ${target}` }] }
	})

	server.registerTool('users', {
		description: 'Get a list of agents in a channel with their last update timestamps',
		inputSchema: { target: z.string() },
		annotations: { readOnlyHint: true },
	}, async ({ target }) => {
		const users = getUsers(target)
		return { content: [{ type: 'text' as const, text: JSON.stringify(users, null, 2) }] }
	})

	server.registerTool('errata', {
		description: 'Edit a previously posted message by its ID',
		inputSchema: { messageId: z.number(), newMessage: z.string() },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ messageId, newMessage }) => {
		const ok = errata(messageId, newMessage)
		return { content: [{ type: 'text' as const, text: ok ? 'Updated.' : 'Message not found.' }] }
	})

	server.registerTool('getNews', {
		description: 'Get all unread messages from joined channels and DMs since your last read cursor. Edited messages (errata) will reappear if modified after your last read. Returns { messages: Message[], topics: Record<channel, Topic>, briefing?: Briefing } — topics only included if changed since last read. Briefing is the operator\'s instructions, included when updated since your last read.',
		inputSchema: { name: z.string() },
		annotations: { readOnlyHint: false },
	}, async ({ name }) => {
		const news = getNews(name)
		return { content: [{ type: 'text' as const, text: JSON.stringify(news) }] }
	})

	server.registerTool('context', {
		description: 'Get a window of messages around a specific message ID. Returns up to `before` messages before it, the message itself, and up to `after` messages after it.',
		inputSchema: { messageId: z.number(), before: z.number().optional(), after: z.number().optional() },
		annotations: { readOnlyHint: true },
	}, async ({ messageId, before, after }) => {
		const msgs = context(messageId, before, after)
		if (msgs.length === 0) return { content: [{ type: 'text' as const, text: 'Message not found.' }] }
		return { content: [{ type: 'text' as const, text: JSON.stringify(msgs) }] }
	})

	server.registerTool('setTopic', {
		description: 'Set the topic of a channel. The topic is a persistent sticky text shown to all agents on join and reported via getNews when changed.',
		inputSchema: { name: z.string(), target: z.string(), topic: z.string() },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ name, target, topic }) => {
		const result = setTopic(name, target, topic)
		return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
	})

	server.registerTool('search', {
		description: 'Search messages by text (case-insensitive). Optionally filter by channel/DM target and/or sender. Returns newest matches first.',
		inputSchema: { query: z.string(), target: z.string().optional(), from: z.string().optional(), limit: z.number().optional() },
		annotations: { readOnlyHint: true },
	}, async ({ query, target, from, limit }) => {
		const results = search(query, target, from, limit)
		return { content: [{ type: 'text' as const, text: JSON.stringify(results) }] }
	})

	return server
}

// --- Dashboard API ---

// GET /api/messages — all messages
app.get('/api/messages', (_req, res) => {
	res.json(allMessages())
})

// GET /api/messages/:target — messages for a target (channel or user)
app.get('/api/messages/:target', (req, res) => {
	res.json(messagesForTarget(req.params.target))
})

// GET /api/news/:name — unread messages for an agent (advances cursor)
app.get('/api/news/:name', (req, res) => {
	res.json(getNews(req.params.name))
})

// POST /api/post — send a message
app.post('/api/post', (req, res) => {
	const { name, target, message, type } = req.body
	if (!name || !target || !message) {
		res.status(400).json({ error: 'Missing name, target, or message' })
		return
	}
	const id = post(name, target, message, type)
	res.json({ ok: true, id })
})

// POST /api/join — agent joins a channel
app.post('/api/join', (req, res) => {
	const { name, target } = req.body
	if (!name || !target) {
		res.status(400).json({ error: 'Missing name or target' })
		return
	}
	join(name, target)
	res.json({ ok: true })
})

// POST /api/part — agent leaves a channel
app.post('/api/part', (req, res) => {
	const { name, target } = req.body
	if (!name || !target) {
		res.status(400).json({ error: 'Missing name or target' })
		return
	}
	part(name, target)
	res.json({ ok: true })
})

// POST /api/dismiss — kick an agent from all channels
app.post('/api/dismiss', (req, res) => {
	const { name } = req.body
	if (!name) {
		res.status(400).json({ error: 'Missing name' })
		return
	}
	dismiss(name)
	res.json({ ok: true })
})

// GET /api/users/:target — list agents in a channel
app.get('/api/users/:target', (req, res) => {
	res.json(getUsers(req.params.target))
})

// GET /api/agents — list all known agents
app.get('/api/agents', (_req, res) => {
	res.json(getAllAgents())
})

// POST /api/errata — edit a message
app.post('/api/errata', (req, res) => {
	const { messageId, newMessage } = req.body
	if (!messageId || !newMessage) {
		res.status(400).json({ error: 'Missing messageId or newMessage' })
		return
	}
	const ok = errata(messageId, newMessage)
	res.json({ ok })
})

// GET /api/topic/:target — get channel topic
app.get('/api/topic/:target', (req, res) => {
	res.json(getTopic(req.params.target))
})

// POST /api/topic — set channel topic
app.post('/api/topic', (req, res) => {
	const { name, target, topic } = req.body
	if (!target || topic === undefined) {
		res.status(400).json({ error: 'Missing target or topic' })
		return
	}
	const result = setTopic(name || 'human', target, topic)
	res.json({ ok: true, topic: result })
})

// GET /api/briefing — get current briefing
app.get('/api/briefing', (_req, res) => {
	res.json(getBriefing())
})

// POST /api/briefing — set briefing (human-only)
app.post('/api/briefing', (req, res) => {
	const { text } = req.body
	if (text === undefined) {
		res.status(400).json({ error: 'Missing text' })
		return
	}
	const result = setBriefing(text)
	res.json({ ok: true, briefing: result })
})

// POST /api/channels/delete — delete a channel and all its messages
app.post('/api/channels/delete', (req, res) => {
	const { name } = req.body
	if (!name) {
		res.status(400).json({ error: 'Missing channel name' })
		return
	}
	deleteChannel(name)
	res.json({ ok: true })
})

// SSE — poll all messages every 2s
app.get('/api/stream', (req, res) => {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	})

	let lastCount = 0
	const poll = () => {
		const msgs = allMessages()
		if (msgs.length !== lastCount) {
			lastCount = msgs.length
			res.write(`data: ${JSON.stringify(msgs)}\n\n`)
		}
	}

	poll()
	const interval = setInterval(poll, 2000)
	req.on('close', () => clearInterval(interval))
})

// --- MCP Transport ---

const transports: Record<string, StreamableHTTPServerTransport> = {}

app.post('/mcp', async (req, res) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined
	try {
		let transport: StreamableHTTPServerTransport

		if (sessionId && transports[sessionId]) {
			transport = transports[sessionId]
		} else if (!sessionId && isInitializeRequest(req.body)) {
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
			res.status(400).json({
				jsonrpc: '2.0',
				error: { code: -32000, message: 'Invalid session' },
				id: null,
			})
			return
		}

		await transport.handleRequest(req, res, req.body)
	} catch (error) {
		console.error('MCP error:', error)
		if (!res.headersSent) {
			res.status(500).json({
				jsonrpc: '2.0',
				error: { code: -32603, message: 'Internal error' },
				id: null,
			})
		}
	}
})

app.get('/mcp', async (req, res) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined
	if (!sessionId || !transports[sessionId]) {
		res.status(400).send('Invalid or missing session ID')
		return
	}
	await transports[sessionId].handleRequest(req, res)
})

app.delete('/mcp', async (req, res) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined
	if (!sessionId || !transports[sessionId]) {
		res.status(400).send('Invalid or missing session ID')
		return
	}
	await transports[sessionId].handleRequest(req, res)
})

process.on('SIGINT', async () => {
	for (const sid in transports) {
		await transports[sid].close()
		delete transports[sid]
	}
	process.exit(0)
})

// --- Server Listen ---
app.listen(port, () => {
	console.log(`mARC unified server (Dashboard API + MCP) listening on http://localhost:${port}`)
	console.log(`- Dashboard API: http://localhost:${port}/api/`)
	console.log(`- MCP Endpoint:  http://localhost:${port}/mcp`)
})
