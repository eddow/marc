import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { join as pathJoin, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { startMarcDaemon } from './daemon.js'
import { waitForMarcHealthy } from './runtime.js'
import { join as joinChannel, setAgentName, welcome } from './store.js'
import { marcServerInfo } from './tools.js'

const sandboxRoot = resolve(process.cwd(), 'sandbox', 'tests-daemon')

function isCallToolResult(value: Awaited<ReturnType<Client['callTool']>>): value is CallToolResult {
	return 'content' in value
}

function isTextContent(value: unknown): value is { type: 'text'; text: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		value.type === 'text' &&
		'text' in value &&
		typeof value.text === 'string'
	)
}

function toolText(result: Awaited<ReturnType<Client['callTool']>>): string {
	assert.equal(isCallToolResult(result), true)
	const content = result.content
	if (!Array.isArray(content)) throw new Error('Expected tool result content array')
	const first = content[0]
	assert.equal(isTextContent(first), true)
	return first.text
}

function toolJson<T>(result: Awaited<ReturnType<Client['callTool']>>): T {
	return JSON.parse(toolText(result)) as T
}

test('streamable HTTP client connects to /mcp and lists tools', async () => {
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(pathJoin(sandboxRoot, 'marc-daemon-test-'))
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

test('MCP joined agent appears in dashboard channel users', async () => {
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(pathJoin(sandboxRoot, 'marc-mcp-presence-'))
	const config = {
		host: '127.0.0.1',
		port: 41200 + Math.floor(Math.random() * 500),
		dataDir,
	}
	const started = await startMarcDaemon(config)

	try {
		await waitForMarcHealthy(config)
		const base = `http://${config.host}:${config.port}`
		const url = new URL(`${base}/mcp`)
		const transport = new StreamableHTTPClientTransport(url)
		const client = new Client(marcServerInfo, { capabilities: {} })

		try {
			await client.connect(transport)
			const syncResult = toolJson<{ agentId: string }>(
				await client.callTool({ name: 'sync', arguments: {} })
			)
			await client.callTool({
				name: 'setName',
				arguments: { agentId: syncResult.agentId, name: 'Ecthelion' },
			})
			await client.callTool({
				name: 'join',
				arguments: { agentId: syncResult.agentId, target: '#general' },
			})

			const messagesRes = await fetch(`${base}/api/messages`)
			const messages = (await messagesRes.json()) as {
				from: string
				target: string
				text: string
				type?: string
			}[]
			assert.equal(
				messages.some(
					(message) =>
						message.from === 'Ecthelion' &&
						message.target === '#general' &&
						message.type === 'join' &&
						message.text === 'joined #general'
				),
				true
			)

			const usersRes = await fetch(`${base}/api/users/${encodeURIComponent('#general')}`)
			assert.equal(usersRes.ok, true)
			const users = (await usersRes.json()) as { name: string; ts?: number }[]
			assert.equal(
				users.some((user) => user.name === 'Ecthelion'),
				true
			)
		} finally {
			await Promise.allSettled([client.close(), transport.close()])
		}
	} finally {
		await started.close()
	}
})

test('MCP post to unjoined channel joins and posts in one call', async () => {
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(pathJoin(sandboxRoot, 'marc-mcp-post-join-'))
	const config = {
		host: '127.0.0.1',
		port: 41400 + Math.floor(Math.random() * 500),
		dataDir,
	}
	const started = await startMarcDaemon(config)

	try {
		await waitForMarcHealthy(config)
		const base = `http://${config.host}:${config.port}`
		const url = new URL(`${base}/mcp`)
		const transport = new StreamableHTTPClientTransport(url)
		const client = new Client(marcServerInfo, { capabilities: {} })

		try {
			await client.connect(transport)
			const syncResult = toolJson<{ agentId: string }>(
				await client.callTool({ name: 'sync', arguments: {} })
			)
			await client.callTool({
				name: 'setName',
				arguments: { agentId: syncResult.agentId, name: 'Glorfindel' },
			})

			const postResult = toolText(
				await client.callTool({
					name: 'post',
					arguments: {
						agentId: syncResult.agentId,
						target: '#council',
						message: 'The road is watched.',
					},
				})
			)
			assert.match(postResult, /^Joined #council\. Sent\. \(id: \d+\)$/)

			const messagesRes = await fetch(`${base}/api/messages`)
			const messages = (await messagesRes.json()) as {
				from: string
				target: string
				text: string
				type?: string
			}[]
			assert.deepEqual(
				messages.map((message) => ({
					from: message.from,
					target: message.target,
					text: message.text,
					type: message.type,
				})),
				[
					{
						from: 'Glorfindel',
						target: '#council',
						text: 'joined #council',
						type: 'join',
					},
					{
						from: 'Glorfindel',
						target: '#council',
						text: 'The road is watched.',
						type: 'text',
					},
				]
			)

			const usersRes = await fetch(`${base}/api/users/${encodeURIComponent('#council')}`)
			assert.equal(usersRes.ok, true)
			const users = (await usersRes.json()) as { name: string; ts?: number }[]
			assert.equal(
				users.some((user) => user.name === 'Glorfindel'),
				true
			)
		} finally {
			await Promise.allSettled([client.close(), transport.close()])
		}
	} finally {
		await started.close()
	}
})

test('MCP initialize succeeds with stale mcp-session-id (e.g. after server restart)', async () => {
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(pathJoin(sandboxRoot, 'marc-mcp-stale-session-'))
	const config = {
		host: '127.0.0.1',
		port: 41600 + Math.floor(Math.random() * 500),
		dataDir,
	}
	const started = await startMarcDaemon(config)

	try {
		await waitForMarcHealthy(config)
		const url = `http://${config.host}:${config.port}/mcp`
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				'mcp-session-id': '00000000-0000-4000-8000-000000000099',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: {
					protocolVersion: '2024-11-05',
					capabilities: {},
					clientInfo: { name: 'stale-session-test', version: '0.0.1' },
				},
				id: 1,
			}),
		})
		assert.equal(res.status, 200)
		assert.equal(res.headers.get('mcp-session-id') !== null, true)
	} finally {
		await started.close()
	}
})

test('MCP DELETE with unknown session is 200 so clients can drop stale mcp-session-id', async () => {
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(pathJoin(sandboxRoot, 'marc-mcp-delete-unknown-'))
	const config = {
		host: '127.0.0.1',
		port: 41700 + Math.floor(Math.random() * 500),
		dataDir,
	}
	const started = await startMarcDaemon(config)

	try {
		await waitForMarcHealthy(config)
		const url = `http://${config.host}:${config.port}/mcp`
		const res = await fetch(url, {
			method: 'DELETE',
			headers: {
				'mcp-session-id': '00000000-0000-4000-8000-000000000088',
				'mcp-protocol-version': '2024-11-05',
			},
		})
		assert.equal(res.status, 200)
	} finally {
		await started.close()
	}
})

test('API and MCP routes are not shadowed by static; unknown paths are 404', async () => {
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(pathJoin(sandboxRoot, 'marc-daemon-routing-'))
	const config = {
		host: '127.0.0.1',
		port: 42000 + Math.floor(Math.random() * 1000),
		dataDir,
	}
	const started = await startMarcDaemon(config)

	try {
		await waitForMarcHealthy(config)
		const base = `http://${config.host}:${config.port}`

		const messagesRes = await fetch(`${base}/api/messages`)
		assert.equal(messagesRes.ok, true)
		assert.equal(messagesRes.headers.get('content-type')?.includes('application/json'), true)

		const { agentId } = welcome()
		const renamed = setAgentName(agentId, 'api-present-agent')
		assert.equal(renamed.ok, true)
		joinChannel('api-present-agent', '#api-presence')
		const usersRes = await fetch(`${base}/api/users/${encodeURIComponent('#api-presence')}`)
		assert.equal(usersRes.ok, true)
		const users = (await usersRes.json()) as { name: string; ts?: number }[]
		assert.equal(users.length, 1)
		assert.equal(users[0].name, 'api-present-agent')
		assert.equal(typeof users[0].ts, 'number')

		const shellChannelsRes = await fetch(`${base}/api/shell-channels`)
		assert.equal(shellChannelsRes.ok, true)
		assert.deepEqual(await shellChannelsRes.json(), [])

		const setTopicRes = await fetch(`${base}/api/topic`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'human', target: '#general', topic: 'welcome' }),
		})
		assert.equal(setTopicRes.ok, true)
		const topicRes = await fetch(`${base}/api/topic/${encodeURIComponent('#general')}`)
		assert.equal(topicRes.ok, true)
		const topic = (await topicRes.json()) as { text: string; setBy: string }
		assert.equal(topic.text, 'welcome')
		assert.equal(topic.setBy, 'human')

		const spaRes = await fetch(`${base}/client-route-that-does-not-exist`)
		assert.equal(spaRes.status, 404)

		if (existsSync(resolve(process.cwd(), 'dist', 'index.html'))) {
			const htmlNav = await fetch(`${base}/stream`, {
				headers: { Accept: 'text/html' },
			})
			assert.equal(htmlNav.ok, true)
			assert.equal(htmlNav.headers.get('content-type')?.includes('text/html'), true)
		}
	} finally {
		await started.close()
	}
})
