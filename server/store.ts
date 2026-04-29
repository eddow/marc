import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const storeEvents = new EventEmitter()

export interface Message {
	id: number
	from: string
	target: string
	text: string
	ts: number
	modified?: number
	type?:
		| 'text'
		| 'action'
		| 'join'
		| 'part'
		| 'shell'
		| 'shell-output'
		| 'shell-error'
		| 'shell-status'
}

export interface Topic {
	text: string
	setBy: string
	ts: number
}

export interface Briefing {
	text: string
	updatedAt: number
}

export interface Agent {
	id: string
	name: string
}

export interface ShellChannel {
	name: string
	cwd: string
	command: string
	isRunning: boolean
	pid?: number
	lastExitCode?: number
	createdAt: number
	createdBy: string
}

// In-memory only — agent IDs are ephemeral (context-scoped, not persisted)
const agents: Map<string, Agent> = new Map()
const processes = new Map<string, ChildProcessWithoutNullStreams>()
const transientMessages: Message[] = []

function generateId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let id = ''
	for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)]
	return agents.has(id) ? generateId() : id
}

export function welcome(): { agentId: string; briefing: Briefing | null } {
	const id = generateId()
	const name = `anon-${id}`
	agents.set(id, { id, name })
	data.lastSeen[name] = now()
	save()
	storeEvents.emit('agents', getMcpAgents())
	return { agentId: id, briefing: data.briefing }
}

export function setAgentName(
	agentId: string,
	newName: string
): { ok: boolean; name: string; error?: string } {
	const agent = agents.get(agentId)
	if (!agent) return { ok: false, name: '', error: 'Unknown agentId. Call welcome() first.' }

	// Enforce unique display names
	for (const a of agents.values()) {
		if (a.id !== agentId && a.name === newName) {
			return { ok: false, name: agent.name, error: `Name "${newName}" is already taken.` }
		}
	}

	const oldName = agent.name
	if (oldName === newName) return { ok: true, name: newName }
	if (oldName !== newName) {
		// Migrate internal data from old name to new name
		if (data.cursors[oldName] !== undefined) {
			data.cursors[newName] = data.cursors[oldName]
			delete data.cursors[oldName]
		}
		if (data.joined[oldName]) {
			data.joined[newName] = data.joined[oldName]
			delete data.joined[oldName]
		}
		if (data.lastSeen[oldName] !== undefined) {
			data.lastSeen[newName] = data.lastSeen[oldName]
			delete data.lastSeen[oldName]
		}
		agent.name = newName
		save()
	}
	storeEvents.emit('agents', getMcpAgents())
	return { ok: true, name: newName }
}

export function resolveAgent(agentId: string): string | null {
	return agents.get(agentId)?.name ?? null
}

export function getAgent(agentId: string): Agent | undefined {
	return agents.get(agentId)
}

export function removeAgent(agentId: string): void {
	agents.delete(agentId)
	storeEvents.emit('agents', getMcpAgents())
}

interface StoreData {
	messages: Message[]
	cursors: Record<string, number>
	joined: Record<string, string[]> // Agent Name -> List of Channel Targets
	lastSeen: Record<string, number> // Agent Name -> Timestamp
	topics: Record<string, Topic> // Channel -> Topic
	shellChannels: Record<string, ShellChannel>
	briefing: Briefing | null
	nextId: number
}

let DATA_DIR = resolve(import.meta.dirname, '..', 'sandbox')
let DATA_FILE = resolve(DATA_DIR, 'store.json')
const MAX_MESSAGES = 500
const MAX_TRANSIENT_MESSAGES = 1000
let lastTimestamp = 0

function emptyStoreData(): StoreData {
	return {
		messages: [],
		cursors: {},
		joined: {},
		lastSeen: {},
		topics: {},
		shellChannels: {},
		briefing: null,
		nextId: 1,
	}
}

let data: StoreData = emptyStoreData()

function now(): number {
	const timestamp = Date.now()
	lastTimestamp = Math.max(timestamp, lastTimestamp + 1)
	return lastTimestamp
}

function storedTimestamps(): number[] {
	return [
		...data.messages.flatMap((m) => [m.ts, m.modified ?? 0]),
		...transientMessages.flatMap((m) => [m.ts, m.modified ?? 0]),
		...Object.values(data.topics).map((topic) => topic.ts),
		...Object.values(data.lastSeen),
		...(data.briefing ? [data.briefing.updatedAt] : []),
	]
}

export function setDataDir(dir: string): void {
	DATA_DIR = resolve(dir)
	DATA_FILE = resolve(DATA_DIR, 'store.json')
}

function load(): void {
	data = emptyStoreData()
	if (existsSync(DATA_FILE)) {
		try {
			const loaded = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
			// Migration: map channel -> target if needed
			if (loaded.messages.length > 0 && 'channel' in loaded.messages[0]) {
				console.log('Migrating store: channel -> target')
				data.messages = loaded.messages.map((m: any) => ({
					id: m.id,
					from: m.from,
					target: m.channel || m.target,
					text: m.text,
					ts: m.ts,
					modified: m.modified,
					type: m.type || 'text',
				}))
				data.nextId = loaded.nextId
				data.cursors = loaded.cursors
			} else {
				data = loaded
				if (!data.joined) data.joined = {}
				if (!data.lastSeen) data.lastSeen = {}
				if (!data.topics) data.topics = {}
				if (!data.shellChannels) data.shellChannels = {}
				if (!data.briefing) data.briefing = null
				for (const shellChannel of Object.values(data.shellChannels)) {
					shellChannel.isRunning = false
					delete shellChannel.pid
				}
				data.messages.forEach((m) => {
					if (!m.type) m.type = 'text'
				})
			}
		} catch {
			console.warn('Failed to parse store.json, starting fresh')
			data = emptyStoreData()
		}
	}
}

function save(): void {
	mkdirSync(DATA_DIR, { recursive: true })
	writeFileSync(DATA_FILE, JSON.stringify(data, null, '\t'))
}

function evict(): void {
	if (data.messages.length > MAX_MESSAGES) {
		data.messages = data.messages.slice(data.messages.length - MAX_MESSAGES)
	}
}

function evictTransient(): void {
	if (transientMessages.length > MAX_TRANSIENT_MESSAGES) {
		transientMessages.splice(0, transientMessages.length - MAX_TRANSIENT_MESSAGES)
	}
}

function nextMessageId(): number {
	return data.nextId++
}

function emitTransientMessage(
	from: string,
	target: string,
	text: string,
	type: NonNullable<Message['type']>
): Message {
	const message: Message = { id: nextMessageId(), from, target, text, ts: now(), type }
	transientMessages.push(message)
	evictTransient()
	storeEvents.emit('message', message)
	return message
}

function emitShellChannels(): void {
	storeEvents.emit('shellChannels', listShellChannels())
}

function validateShellChannelName(name: string): string | null {
	if (!name.startsWith('$')) return 'Shell channel names must start with $'
	if (!/^\$[a-z0-9][a-z0-9-_]*$/i.test(name)) return 'Invalid shell channel name'
	return null
}

function validateShellCommand(command: string): string | null {
	if (!command.trim()) return 'Command is required'
	if (/[|&;<>`]/.test(command)) return 'Command contains forbidden shell operators'
	return null
}

function setShellChannelState(name: string, patch: Partial<ShellChannel>): ShellChannel | null {
	const shellChannel = data.shellChannels[name]
	if (!shellChannel) return null
	Object.assign(shellChannel, patch)
	save()
	emitShellChannels()
	return shellChannel
}

function flushShellBuffer(
	target: string,
	from: string,
	buffer: string,
	type: 'shell-output' | 'shell-error'
) {
	if (!buffer) return ''
	const normalized = buffer.replace(/\r/g, '')
	const lastNewlineIndex = normalized.lastIndexOf('\n')
	if (lastNewlineIndex === -1) return normalized

	const toEmit = normalized.slice(0, lastNewlineIndex)
	const remainder = normalized.slice(lastNewlineIndex + 1)

	if (toEmit) {
		emitTransientMessage(from, target, toEmit, type)
	}
	return remainder
}

function clearTransientMessages(target: string): void {
	for (let i = transientMessages.length - 1; i >= 0; i--) {
		if (transientMessages[i].target === target) transientMessages.splice(i, 1)
	}
}

function stopProcess(name: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
	const process = processes.get(name)
	if (!process) return false
	process.kill(signal)
	return true
}

function normalizeShellChannels() {
	for (const shellChannel of Object.values(data.shellChannels)) {
		shellChannel.isRunning = false
		delete shellChannel.pid
	}
}

function clearJoinedChannels(): void {
	data.joined = {}
}

// --- Public API ---

export function init(): void {
	agents.clear()
	transientMessages.splice(0, transientMessages.length)
	load()
	normalizeShellChannels()
	clearJoinedChannels()
	lastTimestamp = Math.max(0, ...storedTimestamps())
	save()
}

export function post(
	from: string,
	target: string,
	text: string,
	type: Message['type'] = 'text'
): number {
	const id = nextMessageId()
	const message: Message = { id, from, target, text, ts: now(), type }
	data.messages.push(message)
	evict()
	const isNew = data.lastSeen[from] === undefined
	data.lastSeen[from] = now()
	save()
	// Notify SSE streams of the single new message
	storeEvents.emit('message', message)
	if (isNew) storeEvents.emit('agents', getMcpAgents())
	return id
}

export function errata(messageId: number, newText: string): boolean {
	const msg = data.messages.find((m) => m.id === messageId)
	if (!msg) return false
	msg.text = newText
	msg.modified = now()
	save()
	storeEvents.emit('message', msg)
	return true
}

export interface NewsResult {
	messages: Message[]
	topics: Record<string, Topic>
	briefing?: Briefing
}

export function sync(name: string): NewsResult {
	const cursor = data.cursors[name] ?? 0
	const syncedAt = now()
	const joinedChannels = new Set(data.joined[name] || [])

	// A message is "new" if its ts or modified timestamp exceeds the cursor
	const msgTime = (m: Message) => Math.max(m.ts, m.modified ?? 0)
	const isRelevant = (m: Message) => m.target === name || joinedChannels.has(m.target)
	const news = allMessages().filter((m) => msgTime(m) > cursor && isRelevant(m))

	// Collect topic changes since cursor for joined channels
	const changedTopics: Record<string, Topic> = {}
	for (const ch of joinedChannels) {
		const topic = data.topics[ch]
		if (topic && topic.ts > cursor) changedTopics[ch] = topic
	}

	// Include briefing if changed since cursor
	const changedBriefing =
		data.briefing && data.briefing.updatedAt > cursor ? data.briefing : undefined

	data.cursors[name] = syncedAt

	// Delete private messages from the store once they are read (polled)
	const privateMessageIds = new Set(news.filter((m) => m.target === name).map((m) => m.id))
	if (privateMessageIds.size > 0) {
		data.messages = data.messages.filter((m) => !privateMessageIds.has(m.id))
	}

	// Always update lastSeen when getting news
	data.lastSeen[name] = syncedAt
	save()

	const result: NewsResult = { messages: news, topics: changedTopics }
	if (changedBriefing) result.briefing = changedBriefing
	return result
}

/** All messages (for the dashboard UI - user sees everything) */
export function allMessages(): Message[] {
	return [...data.messages, ...transientMessages].sort((a, b) => a.ts - b.ts)
}

/** Messages for a specific target (channel or user) */
export function messagesForTarget(target: string): Message[] {
	return allMessages().filter((m) => m.target === target)
}

// --- IRC Features ---

export interface JoinResult {
	history: Message[]
	topic: Topic | null
}

export function join(agent: string, target: string): JoinResult {
	if (!data.joined[agent]) data.joined[agent] = []
	const alreadyJoined = data.joined[agent].includes(target)
	if (!alreadyJoined) {
		data.joined[agent].push(target)
		post(agent, target, `joined ${target}`, 'join')
		save()
	}
	return {
		history: messagesForTarget(target).slice(-50),
		topic: data.topics[target] ?? null,
	}
}

export function isJoined(agent: string, target: string): boolean {
	return data.joined[agent]?.includes(target) ?? false
}

export function part(agent: string, target: string): void {
	if (!data.joined[agent]) return
	const idx = data.joined[agent].indexOf(target)
	if (idx !== -1) {
		data.joined[agent].splice(idx, 1)
		post(agent, target, `left ${target}`, 'part')
		save()
	}
}

export function dismiss(agent: string): void {
	const channels = data.joined[agent] || []
	// Part all channels
	for (const channel of [...channels]) {
		// copy array to iterate safely while mutating
		part(agent, channel)
	}

	// Transform unread private messages into failure notices for the sender
	const unreadPMs = data.messages.filter((m) => m.target === agent)
	for (const m of unreadPMs) {
		post(agent, m.from, `The message couldn't be delivered: ${m.text}`)
	}

	// Delete the unread PMs
	if (unreadPMs.length > 0) {
		const pmIds = new Set(unreadPMs.map((m) => m.id))
		data.messages = data.messages.filter((m) => !pmIds.has(m.id))
	}

	// Remove agent from all tracking maps
	delete data.joined[agent]
	delete data.lastSeen[agent]
	delete data.cursors[agent]

	// Also remove from in-memory MCP agents Map (matched by name)
	for (const [id, a] of agents.entries()) {
		if (a.name === agent) {
			agents.delete(id)
			break
		}
	}
	storeEvents.emit('agents', getMcpAgents())

	save()
}

export function getUsers(target: string): { name: string; ts?: number }[] {
	return Object.entries(data.joined)
		.filter(([_, channels]) => channels.includes(target))
		.map(([name]) => ({
			name,
			ts: data.lastSeen[name],
		}))
}

/** All MCP agents: merges persisted lastSeen with ephemeral MCP sessions */
export function getMcpAgents(): { id: string; name: string; ts?: number }[] {
	const mcpById = new Map(Array.from(agents.values()).map((a) => [a.name, a.id]))
	// Only include agents that have an MCP session (agentId), not human users
	return Object.keys(data.lastSeen)
		.filter((name) => mcpById.has(name)) // Filter out human users
		.map((name) => ({
			id: mcpById.get(name) ?? '',
			name,
			ts: data.lastSeen[name],
		}))
}

export function context(messageId: number, before = 5, after = 5): Message[] {
	const idx = data.messages.findIndex((m) => m.id === messageId)
	if (idx === -1) return []
	const start = Math.max(0, idx - before)
	const end = Math.min(data.messages.length, idx + after + 1)
	return data.messages.slice(start, end)
}

export function search(
	query?: string,
	options: {
		target?: string
		sender?: string
		limit?: number
	} = {}
): Message[] {
	const { target, sender, limit = 20 } = options
	const results: Message[] = []
	// Search backwards (newest first)
	for (let i = data.messages.length - 1; i >= 0 && results.length < limit; i--) {
		const m = data.messages[i]
		if (target && m.target !== target) continue
		if (sender && m.from !== sender) continue
		if (query && !m.text.toLowerCase().includes(query.toLowerCase())) continue
		results.push(m)
	}
	return results
}

export function setTopic(agent: string, target: string, text: string): Topic {
	const topic: Topic = { text, setBy: agent, ts: now() }
	data.topics[target] = topic
	save()
	storeEvents.emit('topic', { target, topic })
	return topic
}

export function getTopic(target: string): Topic | null {
	return data.topics[target] ?? null
}

export function getBriefing(): Briefing | null {
	return data.briefing
}

export function setBriefing(text: string): Briefing {
	const briefing: Briefing = { text, updatedAt: now() }
	data.briefing = briefing
	save()
	storeEvents.emit('briefing', briefing)
	return briefing
}

export function deleteChannel(target: string): void {
	// Remove all messages for this target
	data.messages = data.messages.filter((m) => m.target !== target)
	// Remove from all agents' joined lists
	for (const agent of Object.keys(data.joined)) {
		const idx = data.joined[agent].indexOf(target)
		if (idx !== -1) data.joined[agent].splice(idx, 1)
	}
	delete data.topics[target]
	save()
	storeEvents.emit('channelDeleted', target)
}

export function getAllChannels() {
	const allTargets = new Set<string>()
	for (const m of data.messages) allTargets.add(m.target)
	return Array.from(allTargets)
		.filter((t) => t.startsWith('#'))
		.map((target) => ({
			name: target,
			topic: data.topics[target]?.text ?? null,
			memberCount: Object.values(data.joined).filter((channels: string[]) =>
				channels.includes(target)
			).length,
		}))
		.sort((a, b) => a.name.localeCompare(b.name))
}

export function listShellChannels(): ShellChannel[] {
	return Object.values(data.shellChannels).sort((a, b) => a.name.localeCompare(b.name))
}

export function getShellChannel(name: string): ShellChannel | null {
	return data.shellChannels[name] ?? null
}

export function createShellChannel(input: {
	name: string
	cwd: string
	command: string
	createdBy: string
}): { ok: true; channel: ShellChannel } | { ok: false; error: string } {
	const nameError = validateShellChannelName(input.name)
	if (nameError) return { ok: false, error: nameError }
	const commandError = validateShellCommand(input.command)
	if (commandError) return { ok: false, error: commandError }
	if (data.shellChannels[input.name]) {
		return { ok: false, error: `Shell channel ${input.name} already exists` }
	}
	const cwd = resolve(input.cwd)
	if (!existsSync(cwd)) return { ok: false, error: `Directory does not exist: ${cwd}` }
	if (!statSync(cwd).isDirectory()) return { ok: false, error: `Not a directory: ${cwd}` }
	const channel: ShellChannel = {
		name: input.name,
		cwd,
		command: input.command.trim(),
		isRunning: false,
		createdAt: Date.now(),
		createdBy: input.createdBy,
	}
	data.shellChannels[channel.name] = channel
	save()
	emitShellChannels()
	emitTransientMessage(
		'system',
		channel.name,
		`${channel.cwd} $ ${channel.command}`,
		'shell-status'
	)
	return { ok: true, channel }
}

export function deleteShellChannel(name: string): boolean {
	const shellChannel = data.shellChannels[name]
	if (!shellChannel) return false
	stopProcess(name, 'SIGTERM')
	delete data.shellChannels[name]
	clearTransientMessages(name)
	data.messages = data.messages.filter((m) => m.target !== name)
	save()
	emitShellChannels()
	storeEvents.emit('channelDeleted', name)
	return true
}

export function startShellChannel(
	name: string,
	requestedBy: string
): { ok: true; channel: ShellChannel } | { ok: false; error: string } {
	const shellChannel = data.shellChannels[name]
	if (!shellChannel) return { ok: false, error: `Unknown shell channel: ${name}` }
	if (processes.has(name) || shellChannel.isRunning) return { ok: true, channel: shellChannel }

	const child = spawn(shellChannel.command, {
		cwd: shellChannel.cwd,
		shell: true,
		env: process.env,
		stdio: 'pipe',
	})
	processes.set(name, child)
	setShellChannelState(name, {
		isRunning: true,
		pid: child.pid,
		lastExitCode: undefined,
	})
	emitTransientMessage(
		'system',
		name,
		`Started by ${requestedBy}: ${shellChannel.command}`,
		'shell'
	)

	let stdoutBuffer = ''
	let stderrBuffer = ''
	child.stdout.on('data', (chunk: Buffer | string) => {
		if (!data.shellChannels[name]) return
		stdoutBuffer += chunk.toString()
		stdoutBuffer = flushShellBuffer(name, 'stdout', stdoutBuffer, 'shell-output')
	})
	child.stderr.on('data', (chunk: Buffer | string) => {
		if (!data.shellChannels[name]) return
		stderrBuffer += chunk.toString()
		stderrBuffer = flushShellBuffer(name, 'stderr', stderrBuffer, 'shell-error')
	})
	child.on('error', (error) => {
		if (!data.shellChannels[name]) return
		emitTransientMessage('system', name, error.message, 'shell-error')
	})
	child.on('close', (code, signal) => {
		if (!data.shellChannels[name]) {
			processes.delete(name)
			return
		}
		stdoutBuffer = flushShellBuffer(name, 'stdout', `${stdoutBuffer}\n`, 'shell-output')
		stderrBuffer = flushShellBuffer(name, 'stderr', `${stderrBuffer}\n`, 'shell-error')
		processes.delete(name)
		setShellChannelState(name, {
			isRunning: false,
			pid: undefined,
			lastExitCode: code ?? undefined,
		})
		emitTransientMessage(
			'system',
			name,
			signal ? `Stopped (${signal})` : `Exited (${code ?? 0})`,
			'shell-status'
		)
	})

	return { ok: true, channel: data.shellChannels[name] }
}

export async function restartShellChannel(
	name: string,
	requestedBy: string
): Promise<{ ok: true; channel: ShellChannel } | { ok: false; error: string }> {
	const shellChannel = data.shellChannels[name]
	if (!shellChannel) return { ok: false, error: `Unknown shell channel: ${name}` }
	const child = processes.get(name)
	if (child) {
		await new Promise<void>((resolveClose) => {
			child.once('close', () => resolveClose())
			stopProcess(name, 'SIGTERM')
		})
	}
	return startShellChannel(name, requestedBy)
}

export function stopShellChannel(
	name: string,
	requestedBy: string
): { ok: boolean; error?: string } {
	const shellChannel = data.shellChannels[name]
	if (!shellChannel) return { ok: false, error: `Unknown shell channel: ${name}` }
	const stopped = stopProcess(name, 'SIGTERM')
	if (!stopped) return { ok: false, error: `Shell channel ${name} is not running` }
	emitTransientMessage('system', name, `Stop requested by ${requestedBy}`, 'shell-status')
	return { ok: true }
}

export function sendShellInput(name: string, input: string): { ok: boolean; error?: string } {
	const shellChannel = data.shellChannels[name]
	if (!shellChannel) return { ok: false, error: `Unknown shell channel: ${name}` }
	const child = processes.get(name)
	if (!child) return { ok: false, error: `Shell channel ${name} is not running` }
	child.stdin.write(input)
	emitTransientMessage('stdin', name, input.replace(/\n$/, ''), 'shell-status')
	return { ok: true }
}

export async function shutdown(): Promise<void> {
	const running = Array.from(processes.entries())
	await Promise.all(
		running.map(
			([name, child]) =>
				new Promise<void>((resolveClose) => {
					child.once('close', () => resolveClose())
					stopProcess(name, 'SIGTERM')
				})
		)
	)
}
