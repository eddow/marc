#!/usr/bin/env node
import { exit } from 'node:process'
import * as readline from 'node:readline'

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp'

// Create readline interface for stdin/stdout
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
})

// Process each line from stdin (JSON-RPC requests)
rl.on('line', async (line: string) => {
	try {
		const response = await fetch(MCP_SERVER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
			},
			body: line,
		})

		if (response.headers.get('content-type')?.includes('text/event-stream')) {
			// Handle SSE response - convert to regular JSON for stdio
			const reader = response.body?.getReader()
			const decoder = new TextDecoder()
			let buffer = ''

			if (reader) {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split('\n')
					buffer = lines.pop() || ''

					for (const l of lines) {
						if (l.startsWith('data: ')) {
							const data = l.slice(6)
							if (data) {
								console.log(data)
							}
						}
					}
				}
			}
		} else {
			// Handle JSON response
			const data = await response.text()
			console.log(data)
		}
	} catch (error) {
		console.error(
			JSON.stringify({
				jsonrpc: '2.0',
				error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
				id: null,
			})
		)
	}
})

// Handle process termination
process.on('SIGINT', () => exit(0))
process.on('SIGTERM', () => exit(0))
