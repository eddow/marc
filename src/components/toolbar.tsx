import { client, componentStyle } from '@pounce'
import { channelPanelUrl, panelPaths } from '../panel-routes'
import { channelNames, setAgentName, settings, shellChannelNames } from '../state'

componentStyle.css`
.toolbar {
	display: flex;
	align-items: center;
	gap: 0.35rem;
}
.toolbar .tb-select {
	margin: 0;
}
.toolbar .tb-select > select {
	padding: 0.15rem 2rem 0.15rem 0.4rem;
	font-size: 0.75em;
	margin: 0;
	min-width: 10rem;
	height: auto;
}
.toolbar .tb-btn {
	padding: 0.15rem 0.5rem;
	font-size: 0.75em;
	margin: 0;
}
.toolbar .agent-label {
	opacity: 0.5;
	font-size: 0.85em;
	margin-left: 0.5rem;
	white-space: nowrap;
	display: flex;
	align-items: center;
	gap: 0.25rem;
}
.toolbar .agent-label input {
	width: 6rem;
	font-size: 0.9em;
	margin: 0;
}
`

const Toolbar = () => {
	const openPanel = (url: string) => {
		client.navigate(url)
	}

	const openChannel = (target: string) => {
		openPanel(channelPanelUrl(target))
	}

	const openAgents = () => openPanel(panelPaths.agents)
	const openStream = () => openPanel(panelPaths.stream)

	const quickTargets = () => [...channelNames(), ...shellChannelNames()].sort()

	return (
		<nav class="toolbar">
			<div class="tb-select">
				<select
					onChange={(e: Event) => {
						const select = e.target as HTMLSelectElement
						if (select.value) {
							openChannel(select.value)
							select.value = ''
						}
					}}
				>
					<option value="" disabled selected>
						Open channel…
					</option>
					<for each={quickTargets()}>
						{(target) => <option value={target}>{target}</option>}
					</for>
				</select>
			</div>
			<button class="outline contrast tb-btn" onClick={openAgents} title="Agents Dashboard">
				👥
			</button>
			<button class="outline contrast tb-btn" onClick={openStream} title="All Messages">
				📜
			</button>
			<button
				class="outline contrast tb-btn"
				onClick={() => openPanel(panelPaths.channels)}
				title="Manage Channels"
			>
				#
			</button>
			<button
				class="outline contrast tb-btn"
				onClick={() => openPanel(panelPaths.briefing)}
				title="Operator Briefing"
			>
				📋
			</button>
			<span class="agent-label">
				👤{' '}
				<input
					type="text"
					class="pounce-input-inline"
					value={settings.agent}
					onBlur={(e: FocusEvent) => setAgentName((e.target as HTMLInputElement).value)}
				/>
			</span>
		</nav>
	)
}

export default Toolbar
