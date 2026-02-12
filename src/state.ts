import { reactive } from 'mutts'

export interface Message {
	id: number
	from: string
	target: string
	text: string
	ts: number
	modified?: number
	type?: 'text' | 'action' | 'join' | 'part'
}

// All messages from the server
export const messages = reactive<Message[]>([])

// Derived: unique target names from messages
export function targetNames(): string[] {
	const set = new Set(messages.map(m => m.target))
	return [...set].sort()
}

// Messages for a specific target
export function messagesForTarget(target: string): Message[] {
	return messages.filter(m => m.target === target)
}

// Derived: unique channel names (# prefixed) from messages
export function channelNames(): string[] {
	const set = new Set(messages.filter(m => m.target.startsWith('#')).map(m => m.target))
	return [...set].sort()
}

export async function deleteChannel(target: string): Promise<boolean> {
	const res = await fetch('/api/channels/delete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: target }),
	})
	if (res.ok) {
		await fetchMessages()
		return true
	}
	return false
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
	const res = await fetch('/api/messages')
	const data: Message[] = await res.json()
	messages.length = 0
	messages.push(...data)
}

export async function postMessage(target: string, agent: string, text: string, type: Message['type'] = 'text'): Promise<number | null> {
	const res = await fetch('/api/post', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: agent, target, message: text, type }),
	})
	if (res.ok) {
		const data: { ok: boolean; id: number } = await res.json()
		await fetchMessages()
		return data.id
	}
	return null
}

export async function editMessage(messageId: number, newMessage: string): Promise<boolean> {
	const res = await fetch('/api/errata', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ messageId, newMessage }),
	})
	if (res.ok) {
		await fetchMessages()
		return true
	}
	return false
}

export async function joinChannel(agent: string, target: string): Promise<boolean> {
	const res = await fetch('/api/join', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: agent, target }),
	})
	if (res.ok) {
		await fetchMessages()
		return true
	}
	return false
}

export async function partChannel(agent: string, target: string): Promise<boolean> {
	const res = await fetch('/api/part', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: agent, target }),
	})
	if (res.ok) {
		await fetchMessages()
		return true
	}
	return false
}

export async function dismissAgent(agent: string): Promise<boolean> {
	const res = await fetch('/api/dismiss', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: agent }),
	})
	if (res.ok) {
		await fetchMessages()
		return true
	}
	return false
}

export async function getUsers(target: string): Promise<{ name: string, ts?: number }[]> {
	const res = await fetch(`/api/users/${encodeURIComponent(target)}`)
	if (res.ok) {
		return await res.json()
	}
	return []
}

export async function getAllAgents(): Promise<{ name: string, ts?: number }[]> {
	const res = await fetch('/api/agents')
	if (res.ok) {
		return await res.json()
	}
	return []
}

export function subscribeAll(): () => void {
	const source = new EventSource('/api/stream')
	source.onmessage = (event) => {
		const data: Message[] = JSON.parse(event.data)
		messages.length = 0
		messages.push(...data)
	}
	return () => source.close()
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
