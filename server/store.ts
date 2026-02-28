import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const storeEvents = new EventEmitter()

export interface Message {
	id: number
	from: string
	target: string
	text: string
	ts: number
	modified?: number
	type?: 'text' | 'action' | 'join' | 'part'
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

// In-memory only — agent IDs are ephemeral (context-scoped, not persisted)
const agents: Map<string, Agent> = new Map()

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
	data.lastSeen[name] = Date.now()
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
	briefing: Briefing | null
	nextId: number
}

let DATA_DIR = resolve(import.meta.dirname, '..', 'sandbox')
let DATA_FILE = resolve(DATA_DIR, 'store.json')
const MAX_MESSAGES = 500

let data: StoreData = {
	messages: [],
	cursors: {},
	joined: {},
	lastSeen: {},
	topics: {},
	briefing: null,
	nextId: 1,
}

export function setDataDir(dir: string): void {
	DATA_DIR = resolve(dir)
	DATA_FILE = resolve(DATA_DIR, 'store.json')
}

function load(): void {
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
				if (!data.briefing) data.briefing = null
				delete (data as any).shellChannels
				data.messages.forEach((m) => {
					if (!m.type) m.type = 'text'
				})
			}
		} catch {
			console.warn('Failed to parse store.json, starting fresh')
			data = {
				messages: [],
				cursors: {},
				joined: {},
				lastSeen: {},
				topics: {},
				briefing: null,
				nextId: 1,
			}
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

// --- Public API ---

export function init(): void {
	load()
}

export function post(
	from: string,
	target: string,
	text: string,
	type: Message['type'] = 'text'
): number {
	const id = data.nextId++
	const message: Message = { id, from, target, text, ts: Date.now(), type }
	data.messages.push(message)
	evict()
	save()
	// Notify SSE streams of the single new message
	storeEvents.emit('message', message)
	return id
}

export function errata(messageId: number, newText: string): boolean {
	const msg = data.messages.find((m) => m.id === messageId)
	if (!msg) return false
	msg.text = newText
	msg.modified = Date.now()
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
	const joinedChannels = new Set(data.joined[name] || [])

	// A message is "new" if its ts or modified timestamp exceeds the cursor
	const msgTime = (m: Message) => Math.max(m.ts, m.modified ?? 0)
	const isRelevant = (m: Message) => m.target === name || joinedChannels.has(m.target)
	const news = data.messages.filter((m) => msgTime(m) > cursor && isRelevant(m))

	// Collect topic changes since cursor for joined channels
	const changedTopics: Record<string, Topic> = {}
	for (const ch of joinedChannels) {
		const topic = data.topics[ch]
		if (topic && topic.ts > cursor) changedTopics[ch] = topic
	}

	// Include briefing if changed since cursor
	const changedBriefing =
		data.briefing && data.briefing.updatedAt > cursor ? data.briefing : undefined

	const allTimes = [...news.map(msgTime), ...Object.values(changedTopics).map((t) => t.ts)]
	if (changedBriefing) allTimes.push(changedBriefing.updatedAt)
	const maxTime = allTimes.length > 0 ? Math.max(...allTimes) : 0

	if (maxTime > cursor) {
		data.cursors[name] = maxTime

		// Delete private messages from the store once they are read (polled)
		const privateMessageIds = new Set(news.filter((m) => m.target === name).map((m) => m.id))
		if (privateMessageIds.size > 0) {
			data.messages = data.messages.filter((m) => !privateMessageIds.has(m.id))
		}
	}

	// Always update lastSeen when getting news
	data.lastSeen[name] = Date.now()
	save()

	const result: NewsResult = { messages: news, topics: changedTopics }
	if (changedBriefing) result.briefing = changedBriefing
	return result
}

/** All messages (for the dashboard UI - user sees everything) */
export function allMessages(): Message[] {
	return data.messages
}

/** Messages for a specific target (channel or user) */
export function messagesForTarget(target: string): Message[] {
	return data.messages.filter((m) => m.target === target)
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
		history: data.messages.filter((m) => m.target === target).slice(-50),
		topic: data.topics[target] ?? null,
	}
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
	// Find all agents who have 'target' in their joined list
	return Object.entries(data.joined)
		.filter(([_, channels]) => channels.includes(target))
		.map(([agent]) => ({
			name: agent,
			ts: data.lastSeen[agent],
		}))
}

export function getAllAgents(): { name: string; ts?: number }[] {
	return Object.keys(data.lastSeen).map((name) => ({
		name,
		ts: data.lastSeen[name],
	}))
}

/** MCP agents: ephemeral in-memory registry, with lastSeen timestamps from store */
export function getMcpAgents(): { id: string; name: string; ts?: number }[] {
	return Array.from(agents.values()).map((a) => ({
		id: a.id,
		name: a.name,
		ts: data.lastSeen[a.name],
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
	const topic: Topic = { text, setBy: agent, ts: Date.now() }
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
	const briefing: Briefing = { text, updatedAt: Date.now() }
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
