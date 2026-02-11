import { reactive } from 'mutts'
import { A } from '@pounce/kit'
import { channels, fetchChannel, subscribeChannel, parseMessages } from '../state'
import Message from '../components/message'

const StreamView = () => {
	const filter = reactive({ agent: '', reversed: false })

	fetchChannel('stream')
	const unsub = subscribeChannel('stream')

	return (
		<div style="display: flex; flex-direction: column; height: calc(100vh - 6rem);">
			<header style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
				<A href="/" style="text-decoration: none;">← Back</A>
				<h2 style="margin: 0;">Event Stream</h2>
				<div style="margin-left: auto; display: flex; gap: 0.5rem; align-items: center;">
					<input
						type="text"
						value={filter.agent}
						placeholder="Filter by agent..."
						style="width: 12rem; margin-bottom: 0;"
					/>
					<label style="display: flex; align-items: center; gap: 0.25rem; white-space: nowrap; margin-bottom: 0;">
						<input type="checkbox" checked={filter.reversed} style="margin-bottom: 0;" />
						Newest first
					</label>
				</div>
			</header>
			<div style="flex: 1; overflow-y: auto; border: 1px solid var(--pico-muted-border-color, #333); border-radius: var(--pico-border-radius, 0.25rem); padding: 0.5rem;">
				<for each={filteredMessages(channels.stream ?? '', filter.agent, filter.reversed)}>{(msg) =>
					<Message message={msg} />
				}</for>
				<p style="text-align: center; opacity: 0.4; padding: 2rem;" if={!channels.stream}>
					<em>No stream events yet</em>
				</p>
			</div>
			<p style="font-size: 0.8em; opacity: 0.5; text-align: center; margin-top: 0.5rem;">
				Read-only — append-only event log
			</p>
		</div>
	)
}

function filteredMessages(text: string, agentFilter: string, reversed: boolean) {
	let msgs = parseMessages(text)
	if (agentFilter.trim()) {
		const lower = agentFilter.toLowerCase()
		msgs = msgs.filter(m => m.agent.toLowerCase().includes(lower))
	}
	if (reversed) msgs = msgs.slice().reverse()
	return msgs
}

export default StreamView
