import { componentStyle } from '@pounce/kit/dom'
import { Combobox } from '@pounce/ui'
import { dock } from '../dock'
import { settings, setAgentName, targetNames } from '../state'

componentStyle.css`
.toolbar {
	display: flex;
	align-items: center;
	gap: 0.35rem;
}
.toolbar .pounce-combobox {
	margin: 0;
}
.toolbar .pounce-combobox > input {
	padding: 0.15rem 0.4rem;
	font-size: 0.75em;
	margin: 0;
	min-width: 8rem;
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
	const openPanel = (id: string, component: string, title: string, params?: Record<string, string>) => {
		const api = dock.api
		if (!api) return
		const existing = api.panels.find(p => p.id === id)
		if (existing) {
			existing.api.setActive()
			return
		}
		api.addPanel({ id, component, title, params })
	}

	const openChannel = (target: string) => {
		openPanel(`channel:${target}`, 'channel', target, { target })
	}

	const openAgents = () => openPanel('agents', 'agents', 'Agents')
	const openStream = () => openPanel('stream', 'stream', 'All Messages')

	const channels = () => targetNames().filter(t => t.startsWith('#'))

	const onChannelPick = (e: KeyboardEvent) => {
		if (e.key !== 'Enter') return
		const input = e.target as HTMLInputElement
		const value = input.value.trim()
		if (!value) return
		const target = value.startsWith('#') ? value : `#${value}`
		openChannel(target)
		input.value = ''
	}



	return (
		<nav class="toolbar">
			{channels()}
			<Combobox
				options={channels()}
				placeholder="Channels…"
				onKeydown={onChannelPick}
			/>
			<button class="outline contrast tb-btn" onClick={openAgents} title="Agents Dashboard">👥</button>
			<button class="outline contrast tb-btn" onClick={openStream} title="All Messages">📜</button>
			<button class="outline contrast tb-btn" onClick={() => openPanel('channels', 'channels', 'Channels')} title="Manage Channels">#</button>
			<button class="outline contrast tb-btn" onClick={() => openPanel('briefing', 'briefing', 'Briefing')} title="Operator Briefing">📋</button>
			<span class="agent-label">
				👤 <input
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
