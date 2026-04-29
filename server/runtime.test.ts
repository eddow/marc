import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { MarcConfig } from './config.js'
import {
	clearDaemonState,
	findListeningPidByPort,
	isProcessAlive,
	readDaemonState,
	restartMarcDaemon,
	spawnMarcDaemon,
	waitForMarcHealthy,
} from './runtime.js'

const sandboxRoot = resolve(process.cwd(), 'sandbox', 'tests-runtime')

async function withEnv<T>(env: Record<string, string>, run: () => Promise<T>): Promise<T> {
	const previous = new Map<string, string | undefined>()
	for (const [key, value] of Object.entries(env)) {
		previous.set(key, process.env[key])
		process.env[key] = value
	}
	try {
		return await run()
	} finally {
		for (const [key, value] of previous.entries()) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
}

async function waitForDead(pid: number, timeoutMs = 5000): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return
		await new Promise((resolve) => setTimeout(resolve, 125))
	}
	throw new Error(`Process ${pid} is still alive`)
}

async function terminate(pid: number): Promise<void> {
	if (!isProcessAlive(pid)) return
	process.kill(pid, 'SIGTERM')
	await waitForDead(pid)
}

test('restartMarcDaemon replaces the recorded daemon process', async () => {
	rmSync(sandboxRoot, { force: true, recursive: true })
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(join(sandboxRoot, 'data-'))
	const xdgStateHome = mkdtempSync(join(sandboxRoot, 'state-'))
	const config: MarcConfig = {
		host: '127.0.0.1',
		port: 43000 + Math.floor(Math.random() * 1000),
		dataDir,
	}
	const invocation = {
		command: process.execPath,
		args: ['--import', 'tsx', 'server/cli.ts'],
		cwd: process.cwd(),
	}
	let restartedPid: number | undefined

	await withEnv({ XDG_STATE_HOME: xdgStateHome }, async () => {
		const initialPid = spawnMarcDaemon(invocation, config)
		if (initialPid === undefined) throw new Error('Daemon spawn did not return a pid')
		await waitForMarcHealthy(config)
		const initialState = readDaemonState()
		assert.equal(initialState?.pid, initialPid)

		try {
			const restarted = await restartMarcDaemon(config, invocation)
			restartedPid = restarted.pid
			assert.notEqual(restarted.pid, initialPid)
			assert.equal(isProcessAlive(initialPid), false)
			assert.equal(readDaemonState()?.pid, restarted.pid)
		} finally {
			const state = readDaemonState()
			const pid = restartedPid ?? state?.pid ?? initialPid
			await terminate(pid)
			clearDaemonState()
		}
	})
})

test('restartMarcDaemon can replace a healthy daemon without runtime state', async () => {
	rmSync(sandboxRoot, { force: true, recursive: true })
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(join(sandboxRoot, 'data-'))
	const xdgStateHome = mkdtempSync(join(sandboxRoot, 'state-'))
	const config: MarcConfig = {
		host: '127.0.0.1',
		port: 44000 + Math.floor(Math.random() * 1000),
		dataDir,
	}
	const invocation = {
		command: process.execPath,
		args: ['--import', 'tsx', 'server/cli.ts'],
		cwd: process.cwd(),
	}
	let restartedPid: number | undefined

	await withEnv({ XDG_STATE_HOME: xdgStateHome }, async () => {
		const initialPid = spawnMarcDaemon(invocation, config)
		if (initialPid === undefined) throw new Error('Daemon spawn did not return a pid')
		await waitForMarcHealthy(config)
		assert.equal(findListeningPidByPort(config.port), initialPid)
		clearDaemonState()
		assert.equal(readDaemonState(), null)

		try {
			const restarted = await restartMarcDaemon(config, invocation)
			restartedPid = restarted.pid
			assert.notEqual(restarted.pid, initialPid)
			assert.equal(isProcessAlive(initialPid), false)
			assert.equal(readDaemonState()?.pid, restarted.pid)
		} finally {
			const state = readDaemonState()
			const pid = restartedPid ?? state?.pid ?? initialPid
			await terminate(pid)
			clearDaemonState()
		}
	})
})
