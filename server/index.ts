import Fastify from 'fastify'
import cors from '@fastify/cors'
import Redis from 'ioredis'

const redis = new Redis({ host: '127.0.0.1', port: 6379 })
const app = Fastify({ logger: true })

await app.register(cors, { origin: true })

const CHANNEL_PREFIX = 'channel:'
const KNOWN_CHANNELS = ['handoff', 'alerts', 'general', 'debug', 'stream'] as const

function formatTimestamp(): string {
	const now = new Date()
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

// GET /api/channels — all channel keys + values
app.get('/api/channels', async () => {
	const keys = KNOWN_CHANNELS.map(c => `${CHANNEL_PREFIX}${c}`)
	const values = await redis.mget(...keys)
	const channels: Record<string, string> = {}
	for (let i = 0; i < KNOWN_CHANNELS.length; i++) {
		channels[KNOWN_CHANNELS[i]] = values[i] ?? ''
	}
	return channels
})

// GET /api/channel/:name — single channel value
app.get<{ Params: { name: string } }>('/api/channel/:name', async (req, reply) => {
	const { name } = req.params
	const value = await redis.get(`${CHANNEL_PREFIX}${name}`)
	if (value === null) {
		reply.code(404)
		return { error: `Channel "${name}" not found` }
	}
	return { name, value }
})

// POST /api/channel/:name — append message
app.post<{ Params: { name: string }; Body: { agent: string; message: string } }>(
	'/api/channel/:name',
	async (req, reply) => {
		const { name } = req.params
		const { agent, message } = req.body
		if (!agent || !message) {
			reply.code(400)
			return { error: 'Missing agent or message' }
		}
		const key = `${CHANNEL_PREFIX}${name}`
		const current = (await redis.get(key)) ?? ''
		const line = `[${formatTimestamp()}] [${agent}]: ${message}`
		const updated = current ? `${current}\n${line}` : line
		await redis.set(key, updated)
		return { ok: true, line }
	},
)

// GET /api/channel/:name/stream — SSE endpoint, polls every 2s
app.get<{ Params: { name: string } }>('/api/channel/:name/stream', async (req, reply) => {
	const { name } = req.params
	const key = `${CHANNEL_PREFIX}${name}`

	reply.raw.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	})

	let lastValue = ''

	const poll = async () => {
		try {
			const value = (await redis.get(key)) ?? ''
			if (value !== lastValue) {
				lastValue = value
				reply.raw.write(`data: ${JSON.stringify({ name, value })}\n\n`)
			}
		} catch {
			// connection closed or redis error — interval will be cleared
		}
	}

	await poll()
	const interval = setInterval(poll, 2000)

	req.raw.on('close', () => {
		clearInterval(interval)
	})
})

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })
console.log(`red-hist server listening on http://localhost:${port}`)
