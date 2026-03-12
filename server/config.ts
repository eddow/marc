import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export interface MarcConfig {
	host: string
	port: number
	dataDir: string
}

interface MarcConfigFile {
	host?: string
	port?: number
	dataDir?: string
}

export interface MarcPaths {
	configDir: string
	configFile: string
	stateDir: string
	runtimeFile: string
}

function xdgPath(envName: string, fallbackSegments: string[]): string {
	const configured = process.env[envName]
	if (configured) return resolve(configured, 'marc')
	return resolve(homedir(), ...fallbackSegments, 'marc')
}

export function getMarcPaths(): MarcPaths {
	const configDir = xdgPath('XDG_CONFIG_HOME', ['.config'])
	const stateDir = xdgPath('XDG_STATE_HOME', ['.local', 'state'])
	return {
		configDir,
		configFile: resolve(configDir, 'config.json'),
		stateDir,
		runtimeFile: resolve(stateDir, 'daemon.json'),
	}
}

function readConfigFile(): MarcConfigFile {
	const { configFile } = getMarcPaths()
	if (!existsSync(configFile)) return {}
	try {
		const parsed = JSON.parse(readFileSync(configFile, 'utf-8'))
		if (!parsed || typeof parsed !== 'object') return {}
		return {
			host: typeof parsed.host === 'string' ? parsed.host : undefined,
			port: typeof parsed.port === 'number' ? parsed.port : undefined,
			dataDir: typeof parsed.dataDir === 'string' ? parsed.dataDir : undefined,
		}
	} catch {
		return {}
	}
}

function readEnvPort(): number | undefined {
	const raw = process.env.PORT
	if (!raw) return undefined
	const parsed = Number.parseInt(raw, 10)
	return Number.isFinite(parsed) ? parsed : undefined
}

export function resolveMarcConfig(overrides: Partial<MarcConfig> = {}): MarcConfig {
	const fileConfig = readConfigFile()
	return {
		host: overrides.host ?? process.env.MARC_HOST ?? fileConfig.host ?? '127.0.0.1',
		port: overrides.port ?? readEnvPort() ?? fileConfig.port ?? 3001,
		dataDir: resolve(
			overrides.dataDir ??
				process.env.MARC_DATA ??
				fileConfig.dataDir ??
				resolve(homedir(), '.marc')
		),
	}
}

export function writeMarcConfigFile(config: Partial<MarcConfig>): string {
	const { configDir, configFile } = getMarcPaths()
	mkdirSync(configDir, { recursive: true })
	writeFileSync(configFile, JSON.stringify(config, null, '\t'))
	return configFile
}

export function marcLoopbackHost(host: string): string {
	return host === '0.0.0.0' ? '127.0.0.1' : host
}

export function marcHttpUrl(config: MarcConfig): string {
	return `http://${marcLoopbackHost(config.host)}:${config.port}`
}

export function marcMcpUrl(config: MarcConfig): string {
	return `${marcHttpUrl(config)}/mcp`
}
