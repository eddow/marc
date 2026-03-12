#!/usr/bin/env node
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveMarcConfig } from './config.js'
import type { CliInvocation } from './runtime.js'
import { startMarcStdioBridge } from './stdio.js'

function currentCliInvocation(): CliInvocation {
	const cliEntry = resolve(process.argv[1] || fileURLToPath(import.meta.url))
	const cliDir = dirname(cliEntry)
	const cwd =
		basename(cliDir) === 'server' || basename(cliDir) === 'dist' ? dirname(cliDir) : cliDir
	if (cliEntry.endsWith('.ts')) {
		return {
			command: process.execPath,
			args: ['--import', 'tsx', resolve(cwd, 'server/cli.ts')],
			cwd,
		}
	}
	return {
		command: process.execPath,
		args: [resolve(cwd, 'dist/cli.js')],
		cwd,
	}
}

await startMarcStdioBridge({
	config: resolveMarcConfig(),
	invocation: currentCliInvocation(),
})
