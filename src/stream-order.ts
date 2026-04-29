import type { Message } from './state'

function messageSortKey(m: Message): number {
	return Math.max(m.ts, m.modified ?? 0)
}

/** Same ordering as the All Messages panel (filter + chronological / newest-first). */
export function orderedStreamMessages(
	source: readonly Message[],
	agentFilter: string,
	newestFirst: boolean
): Message[] {
	let msgs = [...source]
	const q = agentFilter.trim()
	if (q) {
		const lower = q.toLowerCase()
		msgs = msgs.filter((m) => m.from.toLowerCase().includes(lower))
	}
	msgs.sort((a, b) => {
		const d = messageSortKey(a) - messageSortKey(b)
		return d !== 0 ? d : a.id - b.id
	})
	if (newestFirst) msgs.reverse()
	return msgs
}
