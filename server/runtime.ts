import { spawn } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
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

function tryClearDaemonState(): boolean {
	try {
		clearDaemonState()
		return true
	} catch {
		return false
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

async function waitForDaemonStopped(
	pid: number,
	config: MarcConfig,
	timeoutMs = 5000,
	intervalMs = 125
): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return
		if (findListeningPidByPort(config.port) !== pid && !(await isMarcHealthy(config))) return
		await new Promise((resolve) => setTimeout(resolve, intervalMs))
	}
	throw new Error(`mARC daemon process ${pid} did not stop within ${timeoutMs}ms`)
}

function terminateProcess(pid: number): void {
	try {
		process.kill(pid, 'SIGTERM')
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return
		throw error
	}
}

function socketInodesForPort(path: string, port: number): Set<string> {
	const inodes = new Set<string>()
	if (!existsSync(path)) return inodes
	const lines = readFileSync(path, 'utf-8').trim().split('\n').slice(1)
	for (const line of lines) {
		const columns = line.trim().split(/\s+/)
		const localAddress = columns[1]
		const state = columns[3]
		const inode = columns[9]
		if (!localAddress || state !== '0A' || !inode) continue
		const localPort = Number.parseInt(localAddress.split(':')[1] ?? '', 16)
		if (localPort === port) inodes.add(inode)
	}
	return inodes
}

export function findListeningPidByPort(port: number): number | null {
	const inodes = new Set([
		...socketInodesForPort('/proc/net/tcp', port),
		...socketInodesForPort('/proc/net/tcp6', port),
	])
	if (inodes.size === 0 || !existsSync('/proc')) return null
	for (const entry of readdirSync('/proc', { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
		const pid = Number.parseInt(entry.name, 10)
		const fdDir = join('/proc', entry.name, 'fd')
		if (!existsSync(fdDir)) continue
		try {
			for (const fd of readdirSync(fdDir)) {
				const target = readlinkSync(join(fdDir, fd))
				const match = /^socket:\[(\d+)\]$/.exec(target)
				if (match && inodes.has(match[1])) return pid
			}
		} catch {
			// Processes can exit or deny fd access while /proc is being scanned.
		}
	}
	return null
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
	if (state && !isProcessAlive(state.pid)) tryClearDaemonState()
	spawnMarcDaemon(invocation, config)
	await waitForMarcHealthy(config, timeoutMs)
}

export async function restartMarcDaemon(
	config: MarcConfig,
	invocation: CliInvocation,
	timeoutMs = 5000
): Promise<DaemonState> {
	const state = readDaemonState()
	if (state && isProcessAlive(state.pid)) {
		const recordedConfig = {
			host: state.host,
			port: state.port,
			dataDir: state.dataDir,
		}
		if (!(await isMarcHealthy(recordedConfig))) {
			throw new Error(`Refusing to terminate process ${state.pid}: recorded daemon is not healthy`)
		}
		terminateProcess(state.pid)
		await waitForDaemonStopped(state.pid, recordedConfig, timeoutMs)
		clearDaemonState()
	} else if (state) {
		clearDaemonState()
	} else if (await isMarcHealthy(config)) {
		const pid = findListeningPidByPort(config.port)
		if (!pid) {
			throw new Error(
				`Cannot restart healthy mARC daemon at ${marcHttpUrl(config)}: no daemon state found`
			)
		}
		terminateProcess(pid)
		await waitForDaemonStopped(pid, config, timeoutMs)
	}

	spawnMarcDaemon(invocation, config)
	await waitForMarcHealthy(config, timeoutMs)
	const restarted = readDaemonState()
	if (!restarted) throw new Error('mARC daemon restarted but did not write runtime state')
	return restarted
}
