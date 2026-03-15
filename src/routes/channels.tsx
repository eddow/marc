import { client, componentStyle } from '@sursaut/kit'
import { reactive } from 'mutts'
import { dock } from '../dock'
import { channelPanelUrl } from '../panel-routes'
import {
	channelNames,
	createShellChannelApi,
	deleteChannel,
	deleteShellChannelApi,
	postMessage,
	settings,
	shellChannels,
} from '../state'

componentStyle.css`
.channels-panel {
	height: 100%;
	padding: 1rem;
	overflow-y: auto;
}
.channels-panel fieldset {
	margin-bottom: 1.5rem;
}
.channels-panel .section-title {
	margin-bottom: 0.5rem;
}
.channels-panel .section-help {
	margin-top: -0.25rem;
	margin-bottom: 0.75rem;
	font-size: 0.82rem;
	opacity: 0.7;
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
.channels-panel .shell-prefix {
	width: 3rem;
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
.channels-panel .status {
	font-size: 0.8rem;
	opacity: 0.75;
	white-space: nowrap;
}
.channels-panel .shell-command {
	font-family: var(--pico-font-family-monospace, monospace);
	font-size: 0.8rem;
	opacity: 0.72;
	word-break: break-all;
}
.channels-panel .shell-actions {
	width: 110px;
	text-align: right;
}
.channels-panel .empty-row {
	text-align: center;
	opacity: 0.6;
	padding: 2rem;
}
`

const ChannelsWidget = () => {
	const newChannel = reactive({ name: '' })
	const newShell = reactive({ name: '', cwd: '', command: '' })

	const onCreate = async () => {
		const name = newChannel.name.trim()
		if (!name) return
		const target = name.startsWith('#') ? name : `#${name}`
		await postMessage(target, settings.agent, `created channel ${target}`, 'join')
		newChannel.name = ''
		openPanel(target)
	}

	const onCreateShell = async () => {
		const name = newShell.name.trim()
		const cwd = newShell.cwd.trim()
		const command = newShell.command.trim()
		if (!name || !cwd || !command) return
		const target = name.startsWith('$') ? name : `$${name}`
		const result = await createShellChannelApi(target, cwd, command)
		if (!result.ok) return
		newShell.name = ''
		newShell.cwd = ''
		newShell.command = ''
		openPanel(target)
	}

	const onDelete = async (target: string) => {
		if (!dock.dialog) return
		const confirmed = await dock.dialog.confirm({
			title: `Delete ${target}?`,
			message: `All messages in ${target} will be lost.`,
		})
		if (confirmed) await deleteChannel(target)
	}

	const onDeleteShell = async (target: string) => {
		if (!dock.dialog) return
		const confirmed = await dock.dialog.confirm({
			title: `Delete ${target}?`,
			message: `The shell channel configuration and in-session output for ${target} will be removed.`,
		})
		if (confirmed) await deleteShellChannelApi(target)
	}

	const openPanel = (target: string) => {
		client.navigate(channelPanelUrl(target))
	}

	const onInput = (e: Event) => {
		newChannel.name = (e.target as HTMLInputElement).value
	}

	const shellStatus = (isRunning: boolean, lastExitCode?: number) => {
		if (isRunning) return 'RUNNING'
		if (lastExitCode !== undefined) return `STOPPED · exit ${lastExitCode}`
		return 'STOPPED'
	}

	return (
		<div class="channels-panel">
			<h5 class="section-title">Channels</h5>
			<p class="section-help">Public chat rooms for humans and MCP agents.</p>
			<fieldset role="group">
				<input type="text" value="#" readOnly class="hash-prefix" tabIndex={-1} />
				<input
					type="text"
					placeholder="channel-name"
					value={newChannel.name}
					onInput={onInput}
					onKeydown={(e: KeyboardEvent) => {
						if (e.key === 'Enter') onCreate()
					}}
					class="channel-input"
				/>
				<button onClick={onCreate} disabled={!newChannel.name.trim()} class="create-btn">
					Create
				</button>
			</fieldset>

			<table class="striped">
				<thead>
					<tr>
						<th>Channel</th>
						<th class="status">Type</th>
						<th class="actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					<for each={channelNames()}>
						{(target) => (
							<tr>
								<td>
									<a
										href="#"
										onClick={(e: Event) => {
											e.preventDefault()
											openPanel(target)
										}}
									>
										{target}
									</a>
								</td>
								<td class="status">public</td>
								<td class="actions">
									<button
										class="outline contrast delete-btn"
										onClick={() => onDelete(target)}
										title="Delete"
									>
										🗑️
									</button>
								</td>
							</tr>
						)}
					</for>
					<tr if={channelNames().length === 0}>
						<td colSpan={3} class="empty-row">
							No active channels
						</td>
					</tr>
				</tbody>
			</table>

			<h5 class="section-title">Shell Channels</h5>
			<p class="section-help">
				Fixed command channels for operator workflows. Configuration is persisted, output is
				session-only.
			</p>
			<fieldset>
				<div role="group">
					<input type="text" value="$" readOnly class="hash-prefix shell-prefix" tabIndex={-1} />
					<input
						type="text"
						placeholder="channel-name"
						value={newShell.name}
						onInput={(e: Event) => {
							newShell.name = (e.target as HTMLInputElement).value
						}}
						class="channel-input"
					/>
				</div>
				<input
					type="text"
					placeholder="Working directory"
					value={newShell.cwd}
					onInput={(e: Event) => {
						newShell.cwd = (e.target as HTMLInputElement).value
					}}
				/>
				<div role="group">
					<input
						type="text"
						placeholder="Command"
						value={newShell.command}
						onInput={(e: Event) => {
							newShell.command = (e.target as HTMLInputElement).value
						}}
						onKeydown={(e: KeyboardEvent) => {
							if (e.key === 'Enter') onCreateShell()
						}}
						class="channel-input"
					/>
					<button
						onClick={onCreateShell}
						disabled={!newShell.name.trim() || !newShell.cwd.trim() || !newShell.command.trim()}
						class="create-btn"
					>
						Create
					</button>
				</div>
			</fieldset>

			<table class="striped">
				<thead>
					<tr>
						<th>Shell</th>
						<th>Status</th>
						<th class="shell-actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					<for each={shellChannels}>
						{(shell) => (
							<tr>
								<td>
									<a
										href="#"
										onClick={(e: Event) => {
											e.preventDefault()
											openPanel(shell.name)
										}}
									>
										{shell.name}
									</a>
									<div class="shell-command">
										{shell.cwd} $ {shell.command}
									</div>
								</td>
								<td class="status">{shellStatus(shell.isRunning, shell.lastExitCode)}</td>
								<td class="shell-actions">
									<button
										class="outline contrast delete-btn"
										onClick={() => onDeleteShell(shell.name)}
										title="Delete"
									>
										🗑️
									</button>
								</td>
							</tr>
						)}
					</for>
					<tr if={shellChannels.length === 0}>
						<td colSpan={3} class="empty-row">
							No shell channels configured
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}

export default ChannelsWidget
