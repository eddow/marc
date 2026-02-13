#!/usr/bin/env node
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { setDataDir } from './store.js'

function parseArgs(argv: string[]): { port: number, data: string } {
	const args = argv.slice(2)
	let port = 3001
	let data = ''

	for (let i = 0; i < args.length; i++) {
		if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
			port = parseInt(args[i + 1], 10)
			i++
		} else if ((args[i] === '--data' || args[i] === '-d') && args[i + 1]) {
			data = args[i + 1]
			i++
		} else if (args[i] === '--help' || args[i] === '-h') {
			console.log(`
mARC — MCP Agent Relay Chat

Usage: marc [options]

Options:
  -p, --port <number>  Server port (default: 3001)
  -d, --data <path>    Data directory (default: ~/.marc)
  -h, --help           Show this help
`)
			process.exit(0)
		}
	}

	if (!data) {
		data = resolve(process.env.MARC_DATA || resolve(homedir(), '.marc'))
	}

	return { port, data }
}

const config = parseArgs(process.argv)

// Configure data dir before importing the server (which calls init)
setDataDir(config.data)

// Set port via env so server/index.ts picks it up
process.env.PORT = String(config.port)

// Import the server module — this starts Express
await import('./index.js')
