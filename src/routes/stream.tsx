import { reactive } from 'mutts'
import { A } from '@pounce/kit'
import { messages, fetchMessages, subscribeAll, type Message } from '../state'
import MessageView from '../components/message'

const StreamView = () => {
	const filter = reactive({ agent: '', reversed: false })

	fetchMessages()
	subscribeAll()

	const filtered = (): Message[] => {
		let msgs = [...messages]
		if (filter.agent.trim()) {
			const lower = filter.agent.toLowerCase()
			msgs = msgs.filter(m => m.from.toLowerCase().includes(lower))
		}
		if (filter.reversed) msgs.reverse()
		return msgs
	}

	return (
		<div style="display: flex; flex-direction: column; height: calc(100vh - 6rem);">
			<header style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
				<A href="/" style="text-decoration: none;">← Back</A>
				<h2 style="margin: 0;">All Messages</h2>
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
				<for each={filtered()}>{(msg) =>
					<MessageView message={msg} />
				}</for>
				<p style="text-align: center; opacity: 0.4; padding: 2rem;" if={messages.length === 0}>
					<em>No messages yet</em>
				</p>
			</div>
		</div>
	)
}

export default StreamView
