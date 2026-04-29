import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
	StreamableHTTPClientTransport,
	StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { MarcConfig } from './config.js'
import { marcMcpUrl } from './config.js'
import { type CliInvocation, ensureMarcDaemon } from './runtime.js'
import { forwardToolCall, marcServerInfo, registerMarcTools } from './tools.js'

async function createRemoteClient(config: MarcConfig): Promise<{
	client: Client
	transport: StreamableHTTPClientTransport
}> {
	const transport = new StreamableHTTPClientTransport(new URL(marcMcpUrl(config)))
	const client = new Client(marcServerInfo, { capabilities: {} })
	await client.connect(transport)
	return { client, transport }
}

function looksLikeStaleMarcHttpSession(error: unknown): boolean {
	if (error instanceof StreamableHTTPError) {
		return error.message.includes('Invalid session')
	}
	if (error instanceof Error) {
		return error.message.includes('Invalid session') && error.message.includes('POSTing')
	}
	return false
}

export async function startMarcStdioBridge(input: {
	config: MarcConfig
	invocation: CliInvocation
	timeoutMs?: number
}): Promise<void> {
	await ensureMarcDaemon(input.config, input.invocation, input.timeoutMs)
	const remote = await createRemoteClient(input.config)
	const reconnectRemote = async () => {
		await remote.client.close().catch(() => {})
		await remote.transport.close().catch(() => {})
		const next = await createRemoteClient(input.config)
		remote.client = next.client
		remote.transport = next.transport
	}
	const forward = async (name: string, args: Record<string, unknown>) => {
		try {
			return await forwardToolCall(remote.client, name, args)
		} catch (error) {
			if (looksLikeStaleMarcHttpSession(error)) {
				await reconnectRemote()
				return await forwardToolCall(remote.client, name, args)
			}
			throw error
		}
	}
	const stdioServer = new McpServer(marcServerInfo, { capabilities: { logging: {} } })
	registerMarcTools(stdioServer, {
		sync: (args) => forward('sync', args as Record<string, unknown>),
		setName: (args) => forward('setName', args as Record<string, unknown>),
		join: (args) => forward('join', args as Record<string, unknown>),
		post: (args) => forward('post', args as Record<string, unknown>),
		part: (args) => forward('part', args as Record<string, unknown>),
		users: (args) => forward('users', args as Record<string, unknown>),
		errata: (args) => forward('errata', args as Record<string, unknown>),
		setTopic: (args) => forward('setTopic', args as Record<string, unknown>),
		search: (args) => forward('search', args as Record<string, unknown>),
		listChannels: () => forward('list_channels', {}),
	})
	const stdioTransport = new StdioServerTransport()
	const closeAll = async () => {
		await Promise.allSettled([
			stdioServer.close(),
			remote.client.close(),
			remote.transport.close(),
			stdioTransport.close(),
		])
	}
	process.once('SIGINT', () => {
		void closeAll().finally(() => process.exit(0))
	})
	process.once('SIGTERM', () => {
		void closeAll().finally(() => process.exit(0))
	})
	await stdioServer.connect(stdioTransport)
}
