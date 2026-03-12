import { pounceOptions, prodPreset as pounceProdPreset } from '@pounce/core'
import { api } from '@pounce/kit'
import { effect, isReactive, prodPreset as muttsProdPreset, reactive, reactiveOptions } from 'mutts'

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

export interface Topic {
	text: string
	setBy: string
	ts: number
}

export interface Briefing {
	text: string
	updatedAt: number
}

// All messages from the server
export const messages = reactive<Message[]>([])

export interface McpAgent {
	id: string
	name: string
	ts?: number
}

// MCP agents (ephemeral — populated from SSE stream)
export const mcpAgents = reactive<McpAgent[]>([])

export const shellChannels = reactive<ShellChannel[]>([])

if (typeof window !== 'undefined') {
	;(window as any).messages = messages
	;(window as any).isReactive = isReactive
	;(window as any).effect = effect
	;(window as any).muttsOptions = reactiveOptions
}

// Apply production presets for performance as requested
Object.assign(reactiveOptions, muttsProdPreset)
Object.assign(pounceOptions, pounceProdPreset)

// Derived: unique target names from messages
export function targetNames(): string[] {
	if (typeof globalThis !== 'undefined')
		(globalThis as any).__MUTTS_DEBUG__?.logLineage('targetNames')
	void messages.length
	const set = new Set(messages.map((m) => m.target))
	return [...set].sort()
}

// Derived: messages for a specific target
export function messagesForTarget(target: string): Message[] {
	if (typeof globalThis !== 'undefined')
		(globalThis as any).__MUTTS_DEBUG__?.logLineage('messagesForTarget')
	void messages.length
	return messages.filter((m) => m.target === target)
}

// Derived: unique channel names (# prefixed) from messages
export function channelNames(): string[] {
	if (typeof globalThis !== 'undefined')
		(globalThis as any).__MUTTS_DEBUG__?.logLineage('channelNames')
	void messages.length
	const set = new Set(messages.filter((m) => m.target.startsWith('#')).map((m) => m.target))
	return [...set].sort()
}

// Derived: shell channel names ($ prefixed) from messages (fallback)
export function shellChannelNames(): string[] {
	return shellChannels.map((channel) => channel.name)
}

export function getShellChannel(name: string): ShellChannel | null {
	return shellChannels.find((channel) => channel.name === name) ?? null
}

export async function deleteChannel(target: string): Promise<boolean> {
	try {
		await api('/api/channels/delete').post({ name: target })
		await fetchMessages()
		return true
	} catch {
		return false
	}
}

// Persisted agent name
const AGENT_KEY = 'marc:agent'
export const settings = reactive({
	agent: localStorage.getItem(AGENT_KEY) ?? 'human',
})
export function setAgentName(name: string) {
	const trimmed = name.trim() || 'human'
	settings.agent = trimmed
	localStorage.setItem(AGENT_KEY, trimmed)
}

export async function fetchMessages(): Promise<void> {
	console.log('[fetchMessages] fetching...')
	try {
		const res = await fetch('/api/messages')
		console.log('[fetchMessages] status:', res.status)
		const data: Message[] = await res.json()
		console.log('[fetchMessages] count:', data.length)
		messages.splice(0, messages.length, ...data)
	} catch (e) {
		console.error('[fetchMessages] failed:', e)
	}
}

export async function postMessage(
	target: string,
	agent: string,
	text: string,
	type: Message['type'] = 'text'
): Promise<number | null> {
	try {
		const data = await api('/api/post').post<{ ok: boolean; id: number }>({
			name: agent,
			target,
			message: text,
			type,
		})
		await fetchMessages()
		return data.id
	} catch {
		return null
	}
}

export async function editMessage(messageId: number, newMessage: string): Promise<boolean> {
	try {
		await api('/api/errata').post({ messageId, newMessage })
		await fetchMessages()
		return true
	} catch {
		return false
	}
}

export async function joinChannel(agent: string, target: string): Promise<boolean> {
	try {
		await api('/api/join').post({ name: agent, target })
		await fetchMessages()
		return true
	} catch {
		return false
	}
}

export async function partChannel(agent: string, target: string): Promise<boolean> {
	try {
		await api('/api/part').post({ name: agent, target })
		await fetchMessages()
		return true
	} catch {
		return false
	}
}

export async function fetchTopic(target: string): Promise<Topic | null> {
	try {
		return await api(`/api/topic/${encodeURIComponent(target)}`).get<Topic>()
	} catch {
		return null
	}
}

export async function setTopicApi(target: string, topic: string): Promise<boolean> {
	try {
		await api('/api/topic').post({ name: settings.agent, target, topic })
		return true
	} catch {
		return false
	}
}

export async function fetchBriefing(): Promise<Briefing | null> {
	try {
		return await api('/api/briefing').get<Briefing>()
	} catch {
		return null
	}
}

export async function setBriefingApi(text: string): Promise<boolean> {
	try {
		await api('/api/briefing').post({ text })
		return true
	} catch {
		return false
	}
}

export async function dismissAgent(agent: string): Promise<boolean> {
	try {
		await api('/api/dismiss').post({ name: agent })
		await fetchMessages()
		return true
	} catch {
		return false
	}
}

export async function getUsers(target: string): Promise<{ name: string; ts?: number }[]> {
	try {
		return await api(`/api/users/${encodeURIComponent(target)}`).get<
			{ name: string; ts?: number }[]
		>()
	} catch {
		return []
	}
}

export async function getMcpAgents(): Promise<McpAgent[]> {
	try {
		const res = await fetch('/api/agents')
		return await res.json()
	} catch {
		return []
	}
}

export async function preloadInitialData(): Promise<void> {
	console.log('[preloadInitialData] starting...')
	const [_, agents, shells] = await Promise.all([
		fetchMessages(),
		getMcpAgents(),
		fetchShellChannels(),
	])
	console.log('[preloadInitialData] fetched all:', { agents: agents.length, shells: shells.length })
	mcpAgents.splice(0, mcpAgents.length, ...agents)
	shellChannels.splice(0, shellChannels.length, ...shells)
	console.log('[preloadInitialData] finished')
}

type StreamEvent =
	| { type: 'messages'; data: Message[] }
	| { type: 'message'; data: Message }
	| { type: 'agents'; data: McpAgent[] }
	| { type: 'shellChannels'; data: ShellChannel[] }
	| { type: 'topic'; target: string; topic: { text: string; setBy: string; ts: number } }
	| { type: 'briefing'; briefing: { text: string; updatedAt: number } }
	| { type: 'channelDeleted'; target: string }

export function subscribeAll(): () => void {
	const es = new EventSource('/api/stream')
	es.onmessage = (e: MessageEvent) => {
		const ev: StreamEvent = JSON.parse(e.data)
		if (ev.type === 'messages') {
			messages.splice(0, messages.length, ...ev.data)
		} else if (ev.type === 'message') {
			const idx = messages.findIndex((m) => m.id === ev.data.id)
			if (idx >= 0) messages.splice(idx, 1, ev.data)
			else messages.push(ev.data)
		} else if (ev.type === 'agents') {
			mcpAgents.splice(0, mcpAgents.length, ...ev.data)
		} else if (ev.type === 'shellChannels') {
			shellChannels.splice(0, shellChannels.length, ...ev.data)
		} else if (ev.type === 'channelDeleted') {
			for (let i = messages.length - 1; i >= 0; i--) {
				if (messages[i].target === ev.target) messages.splice(i, 1)
			}
			const idx = shellChannels.findIndex((ch) => ch.name === ev.target)
			if (idx >= 0) shellChannels.splice(idx, 1)
		}
	}
	es.onerror = (e) => console.error('[state] SSE error:', e)
	return () => es.close()
}

// Agent color: consistent hue from name
const AGENT_COLORS: Record<string, string> = {}
const HUE_PALETTE = [210, 340, 120, 30, 270, 180, 60, 300, 150, 0]

export function agentColor(agent: string): string {
	if (AGENT_COLORS[agent]) return AGENT_COLORS[agent]
	let hash = 0
	for (let i = 0; i < agent.length; i++) {
		hash = ((hash << 5) - hash + agent.charCodeAt(i)) | 0
	}
	const hue = HUE_PALETTE[Math.abs(hash) % HUE_PALETTE.length]
	const color = `hsl(${hue}, 70%, 65%)`
	AGENT_COLORS[agent] = color
	return color
}

export function formatTimestamp(ts: number): string {
	const d = new Date(ts)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export async function fetchShellChannels(): Promise<ShellChannel[]> {
	try {
		return await api('/api/shell-channels').get<ShellChannel[]>()
	} catch {
		return []
	}
}

export async function createShellChannelApi(
	name: string,
	cwd: string,
	command: string
): Promise<{ ok: boolean; error?: string }> {
	try {
		await api('/api/shell-channels').post({ name, cwd, command, user: settings.agent })
		return { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: String(e) }
	}
}

export async function deleteShellChannelApi(name: string): Promise<boolean> {
	try {
		await api(`/api/shell-channels/${encodeURIComponent(name)}`).delete()
		return true
	} catch {
		return false
	}
}

export async function startShellChannel(name: string): Promise<boolean> {
	try {
		const data = await api(`/api/shell-channels/${encodeURIComponent(name)}/start`).post<{
			ok: boolean
		}>({ user: settings.agent })
		return data.ok
	} catch {
		return false
	}
}

export async function stopShellChannel(name: string): Promise<boolean> {
	try {
		const data = await api(`/api/shell-channels/${encodeURIComponent(name)}/stop`).post<{
			ok: boolean
		}>({ user: settings.agent })
		return data.ok
	} catch {
		return false
	}
}

export async function restartShellChannel(name: string): Promise<boolean> {
	try {
		const data = await api(`/api/shell-channels/${encodeURIComponent(name)}/restart`).post<{
			ok: boolean
		}>({ user: settings.agent })
		return data.ok
	} catch {
		return false
	}
}

export async function sendShellInput(name: string, input: string): Promise<boolean> {
	try {
		const data = await api(`/api/shell-channels/${encodeURIComponent(name)}/input`).post<{
			ok: boolean
		}>({ input })
		return data.ok
	} catch {
		return false
	}
}
