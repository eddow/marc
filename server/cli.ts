#!/usr/bin/env node
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupClient } from 'soup-chop'
import { marcHttpUrl, resolveMarcConfig, writeMarcConfigFile, type MarcConfig } from './config.js'
import { startMarcDaemon } from './daemon.js'
import { marcPackageName } from './package-info.js'
import { type CliInvocation } from './runtime.js'
import { startMarcStdioBridge } from './stdio.js'

type Command = 'serve' | 'stdio' | 'configure' | 'help'

interface ParsedCli {
  command: Command
  config: MarcConfig
  target?: string
}

function printHelp(): void {
  console.log(`
mARC — MCP Agent Relay Chat

Usage:
  marc serve [options]
  marc stdio [options]
  marc configure windsurf [options]

Options:
  -H, --host <hostname> Host to bind or advertise (default: 127.0.0.1)
  -p, --port <number>   Server port (default: 3001)
  -d, --data <path>     Data directory (default: ~/.marc)
  -h, --help            Show this help
`)
}

function parseCli(argv: string[]): ParsedCli {
  const rawArgs = [...argv.slice(2)]
  const first = rawArgs[0]
  let command: Command = 'serve'
  if (first === 'serve' || first === 'stdio' || first === 'configure' || first === 'help') {
    command = first
    rawArgs.shift()
  }
  if (rawArgs.includes('--help') || rawArgs.includes('-h') || command === 'help') {
    return { command: 'help', config: resolveMarcConfig() }
  }
  const overrides: Partial<MarcConfig> = {}
  let target: string | undefined
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]
    if ((arg === '--host' || arg === '-H') && rawArgs[i + 1]) {
      overrides.host = rawArgs[++i]
      continue
    }
    if ((arg === '--port' || arg === '-p') && rawArgs[i + 1]) {
      overrides.port = Number.parseInt(rawArgs[++i], 10)
      continue
    }
    if ((arg === '--data' || arg === '-d') && rawArgs[i + 1]) {
      overrides.dataDir = rawArgs[++i]
      continue
    }
    if (!arg.startsWith('-') && !target) {
      target = arg
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return { command, config: resolveMarcConfig(overrides), target }
}

function currentCliInvocation(): CliInvocation {
  const cliEntry = resolve(process.argv[1] || fileURLToPath(import.meta.url))
  const cliDir = dirname(cliEntry)
  const cwd =
    basename(cliDir) === 'server' || basename(cliDir) === 'dist' ? dirname(cliDir) : cliDir
  if (cliEntry.endsWith('.ts')) {
    return {
      command: process.execPath,
      args: ['--import', 'tsx', cliEntry],
      cwd,
    }
  }
  return {
    command: process.execPath,
    args: [cliEntry],
    cwd,
  }
}

async function configureWindsurf(config: MarcConfig): Promise<void> {
  const configFile = writeMarcConfigFile(config)
  const outcome = await setupClient('windsurf', {
    name: 'marc',
    server: {
      command: 'npx',
      args: ['-y', marcPackageName, 'stdio'],
    },
  })
  console.log(`mARC config saved to ${configFile}`)
  if (outcome.mode === 'auto-config') {
    console.log(`Windsurf MCP config written to ${outcome.path}`)
  } else {
    console.log(`Run ${outcome.command} ${outcome.args.join(' ')}`)
  }
  console.log(`Dashboard: ${marcHttpUrl(config)}/`)
}

const parsed = parseCli(process.argv)

switch (parsed.command) {
	case 'help':
		printHelp()
		break
	case 'serve':
		await startMarcDaemon(parsed.config)
		break
	case 'stdio':
		await startMarcStdioBridge({
			config: parsed.config,
			invocation: currentCliInvocation(),
		})
		break
	case 'configure':
		if (parsed.target !== 'windsurf') {
			throw new Error(`Unsupported configure target: ${parsed.target ?? '(missing)'}`)
		}
		await configureWindsurf(parsed.config)
		break
}
