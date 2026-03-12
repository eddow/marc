import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startMarcDaemon } from './daemon.js'
import { waitForMarcHealthy } from './runtime.js'
import { marcServerInfo } from './tools.js'

const sandboxRoot = resolve(process.cwd(), 'sandbox', 'tests-daemon')

test('streamable HTTP client connects to /mcp and lists tools', async () => {
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(join(sandboxRoot, 'marc-daemon-test-'))
	const config = {
		host: '127.0.0.1',
		port: 41000 + Math.floor(Math.random() * 1000),
		dataDir,
	}
	const started = await startMarcDaemon(config)

	try {
		await waitForMarcHealthy(config)
		const url = new URL(`http://${config.host}:${config.port}/mcp`)
		const transport = new StreamableHTTPClientTransport(url)
		const client = new Client(marcServerInfo, { capabilities: {} })

		try {
			await client.connect(transport)
			const result = await client.listTools()
			assert.equal(
				result.tools.some((tool) => tool.name === 'sync'),
				true
			)
		} finally {
			await Promise.allSettled([client.close(), transport.close()])
		}
	} finally {
		await started.close()
	}
})
