import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { getMarcPaths, resolveMarcConfig, writeMarcConfigFile } from './config.js'
import { clearDaemonState, readDaemonState, writeDaemonState } from './runtime.js'

const sandboxRoot = join(process.cwd(), 'sandbox', 'tests-config-runtime')

function withEnv<T>(env: Record<string, string>, run: () => T): T {
	const previous = new Map<string, string | undefined>()
	for (const [key, value] of Object.entries(env)) {
		previous.set(key, process.env[key])
		process.env[key] = value
	}
	try {
		return run()
	} finally {
		for (const [key, value] of previous.entries()) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
}

test('resolveMarcConfig reads persisted config and runtime state uses xdg paths', () => {
	rmSync(sandboxRoot, { force: true, recursive: true })
	mkdirSync(sandboxRoot, { recursive: true })
	const xdgConfigHome = join(sandboxRoot, 'config-home')
	const xdgStateHome = join(sandboxRoot, 'state-home')
	withEnv({ XDG_CONFIG_HOME: xdgConfigHome, XDG_STATE_HOME: xdgStateHome }, () => {
		const configPath = writeMarcConfigFile({
			host: '127.0.0.1',
			port: 4012,
			dataDir: join(sandboxRoot, 'data'),
		})
		assert.equal(existsSync(configPath), true)
		const resolved = resolveMarcConfig()
		assert.equal(resolved.host, '127.0.0.1')
		assert.equal(resolved.port, 4012)
		assert.equal(resolved.dataDir, join(sandboxRoot, 'data'))
		const paths = getMarcPaths()
		assert.equal(paths.configFile, configPath)
		writeDaemonState({
			pid: process.pid,
			host: resolved.host,
			port: resolved.port,
			startedAt: 123,
			dataDir: resolved.dataDir,
		})
		assert.deepEqual(readDaemonState(), {
			pid: process.pid,
			host: '127.0.0.1',
			port: 4012,
			startedAt: 123,
			dataDir: join(sandboxRoot, 'data'),
		})
		clearDaemonState()
		assert.equal(readDaemonState(), null)
	})
})
