import { reactive } from 'mutts'

export interface ParsedMessage {
	timestamp: string
	agent: string
	content: string
	raw: string
}

const MESSAGE_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] \[([^\]]+)\]: ([\s\S]*)$/

export function parseMessage(line: string): ParsedMessage {
	const match = MESSAGE_RE.exec(line.trim())
	if (match) {
		return { timestamp: match[1], agent: match[2], content: match[3], raw: line }
	}
	return { timestamp: '', agent: '', content: line.trim(), raw: line }
}

export function parseMessages(text: string): ParsedMessage[] {
	if (!text.trim()) return []
	// Messages start with [YYYY-MM-DD HH:MM] — split on that boundary
	const lines = text.split(/\n(?=\[)/)
	return lines.map(parseMessage).filter(m => m.raw.trim())
}

export const CHANNEL_NAMES = ['handoff', 'alerts', 'general', 'debug', 'stream'] as const
export type ChannelName = (typeof CHANNEL_NAMES)[number]

export const channels = reactive<Record<string, string>>({})

// Persisted agent name
const AGENT_KEY = 'red-hist:agent'
export const settings = reactive({
	agent: localStorage.getItem(AGENT_KEY) ?? 'human',
})
export function setAgentName(name: string) {
	const trimmed = name.trim() || 'human'
	settings.agent = trimmed
	localStorage.setItem(AGENT_KEY, trimmed)
}

export async function fetchAllChannels(): Promise<void> {
	const res = await fetch('/api/channels')
	const data: Record<string, string> = await res.json()
	for (const [name, value] of Object.entries(data)) {
		channels[name] = value
	}
}

export async function fetchChannel(name: string): Promise<void> {
	const res = await fetch(`/api/channel/${name}`)
	if (res.ok) {
		const data: { name: string; value: string } = await res.json()
		channels[data.name] = data.value
	}
}

export async function postMessage(channelName: string, agent: string, message: string): Promise<boolean> {
	const res = await fetch(`/api/channel/${channelName}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ agent, message }),
	})
	if (res.ok) {
		await fetchChannel(channelName)
		return true
	}
	return false
}

export function subscribeChannel(name: string): () => void {
	const source = new EventSource(`/api/channel/${name}/stream`)
	source.onmessage = (event) => {
		const data: { name: string; value: string } = JSON.parse(event.data)
		channels[data.name] = data.value
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
