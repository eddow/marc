import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { MarcConfig } from './config.js'
import { marcMcpUrl } from './config.js'
import { ensureMarcDaemon, type CliInvocation } from './runtime.js'
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

export async function startMarcStdioBridge(input: {
	config: MarcConfig
	invocation: CliInvocation
	timeoutMs?: number
}): Promise<void> {
	await ensureMarcDaemon(input.config, input.invocation, input.timeoutMs)
	const { client, transport: remoteTransport } = await createRemoteClient(input.config)
	const stdioServer = new McpServer(marcServerInfo, { capabilities: { logging: {} } })
	registerMarcTools(stdioServer, {
		sync: (args) => forwardToolCall(client, 'sync', args),
		setName: (args) => forwardToolCall(client, 'setName', args),
		join: (args) => forwardToolCall(client, 'join', args),
		post: (args) => forwardToolCall(client, 'post', args),
		part: (args) => forwardToolCall(client, 'part', args),
		users: (args) => forwardToolCall(client, 'users', args),
		errata: (args) => forwardToolCall(client, 'errata', args),
		setTopic: (args) => forwardToolCall(client, 'setTopic', args),
		search: (args) => forwardToolCall(client, 'search', args),
		listChannels: () => forwardToolCall(client, 'list_channels', {}),
	})
	const stdioTransport = new StdioServerTransport()
	const closeAll = async () => {
		await Promise.allSettled([
			stdioServer.close(),
			client.close(),
			remoteTransport.close(),
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
