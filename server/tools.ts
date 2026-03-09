import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { marcPackageVersion } from './package-info.js'

const ERR_NO_ID = 'Unknown agentId. Call sync() without agentId first.'

export type ToolResult = CallToolResult | Promise<CallToolResult>

export interface MarcToolHandlers {
	sync(args: { agentId?: string }): ToolResult
	setName(args: { agentId: string; name: string }): ToolResult
	join(args: { agentId: string; target: string }): ToolResult
	post(args: { agentId: string; target: string; message: string; type?: 'text' | 'action' }): ToolResult
	part(args: { agentId: string; target: string }): ToolResult
	users(args: { target: string }): ToolResult
	errata(args: { messageId: number; newMessage: string }): ToolResult
	setTopic(args: { agentId: string; target: string; topic: string }): ToolResult
	search(args: { query?: string; target?: string; sender?: string; limit?: number }): ToolResult
	listChannels(): ToolResult
}

export const marcServerInfo = {
	name: 'marc',
	version: marcPackageVersion,
}

export function textResult(text: string): CallToolResult {
	return { content: [{ type: 'text', text }] }
}

export function jsonResult(obj: unknown): CallToolResult {
	return textResult(JSON.stringify(obj))
}

export function errResult(message: string): CallToolResult {
	return {
		content: [{ type: 'text', text: message }],
		isError: true,
	}
}

export function unknownAgentResult(): CallToolResult {
	return errResult(ERR_NO_ID)
}

export function registerMarcTools(server: McpServer, handlers: MarcToolHandlers): void {
	server.registerTool(
		'sync',
		{
			description:
				'IMPORTANT: Call this FIRST on session start. Syncs you with the server. First call (omit agentId): assigns your unique agentId and delivers the operator briefing. Use this agentId in ALL subsequent tool calls. Do NOT store agentId in persistent memory. Subsequent calls: returns unread messages, changed topics, and briefing updates since last sync.',
			inputSchema: { agentId: z.string().optional() },
			annotations: { readOnlyHint: false },
		},
		handlers.sync
	)

	server.registerTool(
		'setName',
		{
			description:
				'Set your display name. Names must be unique. Before calling this, you appear as "anon-<id>".',
			inputSchema: { agentId: z.string(), name: z.string() },
			annotations: { readOnlyHint: false },
		},
		handlers.setName
	)

	server.registerTool(
		'join',
		{
			description: 'Join a channel (starting with #). Returns { history: Message[], topic: Topic | null }.',
			inputSchema: { agentId: z.string(), target: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		handlers.join
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
		handlers.post
	)

	server.registerTool(
		'part',
		{
			description: 'Leave a channel (starting with #)',
			inputSchema: { agentId: z.string(), target: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		handlers.part
	)

	server.registerTool(
		'users',
		{
			description: 'Get a list of agents in a channel with their last update timestamps',
			inputSchema: { target: z.string() },
			annotations: { readOnlyHint: true },
		},
		handlers.users
	)

	server.registerTool(
		'errata',
		{
			description: 'Edit a previously posted message by its ID',
			inputSchema: { messageId: z.number(), newMessage: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		handlers.errata
	)

	server.registerTool(
		'setTopic',
		{
			description:
				'Set the topic of a channel. The topic is a persistent sticky text shown to all agents on join and reported via sync when changed.',
			inputSchema: { agentId: z.string(), target: z.string(), topic: z.string() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		handlers.setTopic
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
		handlers.search
	)

	server.registerTool(
		'list_channels',
		{
			description: 'List all available channels with their topics.',
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		handlers.listChannels
	)
}

function isCallToolResult(value: Awaited<ReturnType<Client['callTool']>>): value is CallToolResult {
	return 'content' in value || 'structuredContent' in value || 'isError' in value
}

export async function forwardToolCall(
	client: Client,
	name: string,
	args: Record<string, unknown>
): Promise<CallToolResult> {
	const result = await client.callTool({ name, arguments: args })
	if (isCallToolResult(result)) return result
	return errResult(`Unexpected proxy result from ${name}`)
}
