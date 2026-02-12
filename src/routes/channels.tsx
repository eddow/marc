import { reactive } from 'mutts'
import { componentStyle } from '@pounce/kit/dom'
import { channelNames, deleteChannel, settings, postMessage } from '../state'
import { dock } from '../dock'

componentStyle.css`
.channels-panel {
	position: absolute;
	inset: 0;
	padding: 1rem;
	overflow-y: auto;
}
.channels-panel fieldset {
	margin-bottom: 1.5rem;
}
.channels-panel .hash-prefix {
	width: 2.2rem;
	text-align: center;
	padding: 0.5rem 0;
	cursor: default;
	background: var(--pico-secondary-background-color);
	border-color: var(--pico-muted-border-color);
	color: var(--pico-muted-color);
	flex: none;
}
.channels-panel .channel-input {
	flex: 1;
}
.channels-panel .create-btn {
	margin-bottom: 0;
	padding: 0.4rem 0.75rem;
	font-size: 0.8em;
	width: auto;
	flex: none;
}
.channels-panel .actions {
	width: 80px;
	text-align: right;
}
.channels-panel .delete-btn {
	padding: 0.2rem 0.5rem;
	font-size: 0.8em;
	border: none;
	background: transparent;
}
.channels-panel .empty-row {
	text-align: center;
	opacity: 0.6;
	padding: 2rem;
}
`

const ChannelsWidget = () => {
	const newChannel = reactive({ name: '' })

	const onCreate = async () => {
		const name = newChannel.name.trim()
		if (!name) return

		const target = name.startsWith('#') ? name : `#${name}`

		// Post a message to create the channel implicitly
		await postMessage(target, settings.agent, `created channel ${target}`, 'join')
		newChannel.name = ''

		// Open the panel
		const api = dock.api
		if (api) {
			const id = `channel:${target}`
			if (!api.panels.find(p => p.id === id)) {
				api.addPanel({
					id,
					component: 'channel',
					title: target,
					params: { target }
				})
			} else {
				// Focus if already exists
				const panel = api.panels.find(p => p.id === id)
				panel?.api.setActive()
			}
		}
	}

	const onDelete = async (target: string) => {
		if (dock.dialog) {
			const confirmed = await dock.dialog.confirm({
				title: `Delete ${target}?`,
				message: `Are you sure you want to delete ${target}? All messages will be lost.`
			})
			if (confirmed) {
				await deleteChannel(target)
			}
		}
	}

	const onOpen = (target: string) => {
		const api = dock.api
		if (api) {
			const id = `channel:${target}`
			const existing = api.panels.find(p => p.id === id)
			if (existing) {
				existing.api.setActive()
			} else {
				api.addPanel({
					id,
					component: 'channel',
					title: target,
					params: { target }
				})
			}
		}
	}

	const onInput = (e: Event) => {
		newChannel.name = (e.target as HTMLInputElement).value
	}

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') onCreate()
	}

	return (
		<div class="channels-panel">
			<label>Create Channel</label>
			<fieldset role="group">
				<input
					type="text"
					value="#"
					readOnly
					class="hash-prefix"
					tabIndex={-1}
				/>
				<input
					type="text"
					placeholder="new-channel"
					value={newChannel.name}
					onInput={onInput}
					onKeydown={onKeydown}
					class="channel-input"
				/>
				<button
					onClick={onCreate}
					disabled={!newChannel.name.trim()}
					class="create-btn"
				>
					Create
				</button>
			</fieldset>

			<table class="striped">
				<thead>
					<tr>
						<th>Channel</th>
						<th class="actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					<for each={channelNames()}>{(target) =>
						<tr>
							<td>
								<a href="#" onClick={(e: Event) => { e.preventDefault(); onOpen(target) }}>
									{target}
								</a>
							</td>
							<td class="actions">
								<button
									class="outline contrast delete-btn"
									onClick={() => onDelete(target)}
									title="Delete Channel"
								>🗑️</button>
							</td>
						</tr>
					}</for>
					<tr if={channelNames().length === 0}>
						<td colSpan={2} class="empty-row">
							No active channels
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}

export default ChannelsWidget
