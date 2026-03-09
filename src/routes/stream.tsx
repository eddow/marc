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
.stream-summary {
	font-size: 0.8rem;
	opacity: 0.65;
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
	min-height: 0;
	overflow-y: auto;
	border: 1px solid var(--pico-muted-border-color, #333);
	border-radius: var(--pico-border-radius, 0.25rem);
	padding: 0.5rem;
	background: color-mix(in srgb, var(--pico-card-background-color, #1a1f29) 75%, transparent);
}
.stream-empty {
	text-align: center;
	opacity: 0.4;
	padding: 2rem;
}
`

const StreamWidget = (_props: DockviewWidgetProps) => {
	const state = reactive({ agent: '', reversed: false })

	const filtered = (): Message[] => {
		void messages.length
		let msgs = [...messages]
		if (state.agent.trim()) {
			const lower = state.agent.toLowerCase()
			msgs = msgs.filter((m) => m.from.toLowerCase().includes(lower))
		}
		if (state.reversed) msgs.reverse()
		return msgs
	}

	return (
		<div class="stream-panel">
			<header class="stream-header">
				<h3>All Messages</h3>
				<span class="stream-summary">{filtered().length} visible</span>
				<div class="stream-filters">
					<input
						type="text"
						value={state.agent}
						placeholder="Filter by agent..."
						onInput={(e: Event) => {
							state.agent = (e.target as HTMLInputElement).value
						}}
					/>
					<label>
						<input
							type="checkbox"
							checked={state.reversed}
							onInput={(e: Event) => {
								state.reversed = (e.target as HTMLInputElement).checked
							}}
						/>
						Newest first
					</label>
				</div>
			</header>
			<div class="stream-messages">
				<for each={filtered()}>{(msg) => <MessageView message={msg} />}</for>
				<p class="stream-empty" if={filtered().length === 0}>
					<em>No messages yet</em>
				</p>
			</div>
		</div>
	)
}

export default StreamWidget
