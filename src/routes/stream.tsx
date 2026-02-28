import { componentStyle, type DockviewWidgetProps } from '@pounce'
import { reactive } from 'mutts'
import MessageView from '../components/message'
import { type Message, messages } from '../state'

componentStyle.css`
.stream-panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	padding: 0.5rem;
}
.stream-header {
	display: flex;
	align-items: center;
	gap: 1rem;
	margin-bottom: 0.5rem;
	flex-wrap: wrap;
	flex-shrink: 0;
}
.stream-header h3 {
	margin: 0;
}
.stream-filters {
	margin-left: auto;
	display: flex;
	gap: 0.5rem;
	align-items: center;
}
.stream-filters input[type="text"] {
	width: 12rem;
	margin-bottom: 0;
}
.stream-filters label {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	white-space: nowrap;
	margin-bottom: 0;
}
.stream-filters label input {
	margin-bottom: 0;
}
.stream-messages {
	flex: 1;
	overflow-y: auto;
	border: 1px solid var(--pico-muted-border-color, #333);
	border-radius: var(--pico-border-radius, 0.25rem);
	padding: 0.5rem;
}
.stream-empty {
	text-align: center;
	opacity: 0.4;
	padding: 2rem;
}
`

const StreamWidget = (_props: DockviewWidgetProps) => {
	const filter = reactive({ agent: '', reversed: false })

	const filtered = (): Message[] => {
		let msgs = [...messages]
		if (filter.agent.trim()) {
			const lower = filter.agent.toLowerCase()
			msgs = msgs.filter((m) => m.from.toLowerCase().includes(lower))
		}
		if (filter.reversed) msgs.reverse()
		return msgs
	}

	return (
		<div class="stream-panel">
			<header class="stream-header">
				<h3>All Messages</h3>
				<div class="stream-filters">
					<input type="text" value={filter.agent} placeholder="Filter by agent..." />
					<label>
						<input type="checkbox" checked={filter.reversed} />
						Newest first
					</label>
				</div>
			</header>
			<div class="stream-messages">
				<for each={filtered()}>{(msg) => <MessageView message={msg} />}</for>
				<p class="stream-empty" if={messages.length === 0}>
					<em>No messages yet</em>
				</p>
			</div>
		</div>
	)
}

export default StreamWidget
