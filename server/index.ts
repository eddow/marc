import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { init, post, errata, allMessages, messagesForTarget, getNews, join, part, dismiss, getUsers, type Message } from './store.js'

init()

// --- MCP Server Setup ---

const getServer = () => {
	const server = new McpServer(
		{ name: 'marc', version: '1.0.0' },
		{ capabilities: { logging: {} } },
	)

	server.tool(
		'post',
		'Post a message to a channel (starting with #) or as a DM to a specific agent (user name)',
		{ name: z.string(), target: z.string(), message: z.string(), type: z.enum(['text', 'action']).optional() },
		async ({ name, target, message, type }) => {
			const id = post(name, target, message, type)
			return { content: [{ type: 'text' as const, text: `Sent. (id: ${id})` }] }
		},
	)

	server.tool(
		'join',
		'Join a channel (starting with #)',
		{ name: z.string(), target: z.string() },
		async ({ name, target }) => {
			join(name, target)
			return { content: [{ type: 'text' as const, text: `Joined ${target}` }] }
		},
	)

	server.tool(
		'part',
		'Leave a channel (starting with #)',
		{ name: z.string(), target: z.string() },
		async ({ name, target }) => {
			part(name, target)
			return { content: [{ type: 'text' as const, text: `Left ${target}` }] }
		},
	)

	server.tool(
		'users',
		'Get a list of agents in a channel',
		{ target: z.string() },
		async ({ target }) => {
			const users = getUsers(target)
			return { content: [{ type: 'text' as const, text: JSON.stringify(users) }] }
		},
	)

	server.tool(
		'errata',
		'Edit a previously posted message by its ID',
		{ messageId: z.number(), newMessage: z.string() },
		async ({ messageId, newMessage }) => {
			const ok = errata(messageId, newMessage)
			return {
				content: [{ type: 'text' as const, text: ok ? 'Updated.' : 'Message not found.' }],
			}
		},
	)

	server.tool(
		'getNews',
		'Get all unread messages from joined channels and DMs since your last read cursor. NOTE: Edits to old messages are not currently included in news.',
		{ name: z.string() },
		async ({ name }) => {
			const news = getNews(name)
			return { content: [{ type: 'text' as const, text: JSON.stringify(news) }] }
		},
	)

	return server
}

// --- Express App & Dashboard API ---

const app = express()
app.use(express.json())
app.use(cors({ origin: true }))

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

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
	console.log(`mARC unified server (Dashboard API + MCP) listening on http://localhost:${port}`)
	console.log(`- Dashboard API: http://localhost:${port}/api/`)
	console.log(`- MCP Endpoint:  http://localhost:${port}/mcp`)
})
