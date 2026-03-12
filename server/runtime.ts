import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { MarcConfig } from './config.js'
import { getMarcPaths, marcHttpUrl } from './config.js'

export interface DaemonState {
	pid: number
	host: string
	port: number
	startedAt: number
	dataDir: string
}

export interface CliInvocation {
	command: string
	args: string[]
	cwd: string
}

export function readDaemonState(): DaemonState | null {
	const { runtimeFile } = getMarcPaths()
	if (!existsSync(runtimeFile)) return null
	try {
		const parsed = JSON.parse(readFileSync(runtimeFile, 'utf-8'))
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			typeof parsed.pid !== 'number' ||
			typeof parsed.host !== 'string' ||
			typeof parsed.port !== 'number' ||
			typeof parsed.startedAt !== 'number' ||
			typeof parsed.dataDir !== 'string'
		) {
			return null
		}
		return parsed
	} catch {
		return null
	}
}

export function writeDaemonState(state: DaemonState): void {
	const { runtimeFile } = getMarcPaths()
	mkdirSync(dirname(runtimeFile), { recursive: true })
	writeFileSync(runtimeFile, JSON.stringify(state, null, '\t'))
}

export function clearDaemonState(): void {
	const { runtimeFile } = getMarcPaths()
	if (!existsSync(runtimeFile)) return
	try {
		rmSync(runtimeFile)
	} catch (error) {
		if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
	}
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

export async function isMarcHealthy(config: MarcConfig): Promise<boolean> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 500)
	try {
		const response = await fetch(`${marcHttpUrl(config)}/healthz`, {
			method: 'GET',
			signal: controller.signal,
		})
		return response.ok
	} catch {
		return false
	} finally {
		clearTimeout(timeout)
	}
}

export async function waitForMarcHealthy(
	config: MarcConfig,
	timeoutMs = 5000,
	intervalMs = 125
): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (await isMarcHealthy(config)) return
		await new Promise((resolve) => setTimeout(resolve, intervalMs))
	}
	throw new Error(
		`mARC daemon did not become healthy at ${marcHttpUrl(config)} within ${timeoutMs}ms`
	)
}

function serveArgs(config: MarcConfig): string[] {
	return ['serve', '--host', config.host, '--port', String(config.port), '--data', config.dataDir]
}

export function spawnMarcDaemon(invocation: CliInvocation, config: MarcConfig): number | undefined {
	const child = spawn(invocation.command, [...invocation.args, ...serveArgs(config)], {
		cwd: invocation.cwd,
		detached: true,
		stdio: 'ignore',
		env: process.env,
	})
	child.unref()
	return child.pid
}

export async function ensureMarcDaemon(
	config: MarcConfig,
	invocation: CliInvocation,
	timeoutMs = 5000
): Promise<void> {
	if (await isMarcHealthy(config)) return
	const state = readDaemonState()
	if (state && !isProcessAlive(state.pid)) clearDaemonState()
	spawnMarcDaemon(invocation, config)
	await waitForMarcHealthy(config, timeoutMs)
}
