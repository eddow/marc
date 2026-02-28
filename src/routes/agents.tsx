import { componentStyle, type DockviewWidgetProps } from '@pounce'
import { dock } from '../dock'
import { dismissAgent, formatTimestamp, mcpAgents, settings } from '../state'

componentStyle.css`
.agents-panel {
	height: 100%;
	padding: 1rem;
	overflow-y: auto;
}
.agents-panel header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 1rem;
}
.agents-panel header h3 {
	margin: 0;
}
.agents-panel .count {
	font-size: 0.8em;
	opacity: 0.6;
}
.agents-panel .status-never {
	opacity: 0.3;
}
.agents-panel .status-online {
	color: var(--pico-ins-color, #0a0);
	font-weight: bold;
}
.agents-panel .status-offline {
	opacity: 0.6;
}
.agents-panel .actions {
	text-align: right;
}
.agents-panel .dismiss-btn {
	padding: 0.2rem 0.6rem;
	font-size: 0.8em;
	margin: 0;
}
.agents-panel .empty-row {
	text-align: center;
	opacity: 0.5;
	padding: 3rem;
}
`

const formatDuration = (ms: number): string => {
	const seconds = Math.floor(ms / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	if (days > 7) return `${Math.floor(days / 7)} weeks`
	if (days > 0) return `${days} days`
	if (hours > 0) return `${hours} hours`
	if (minutes > 0) return `${minutes} minutes`
	return `${seconds} seconds`
}

const AgentsWidget = (_props: DockviewWidgetProps) => {
	const sorted = () => [...mcpAgents].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))

	const kick = async (agent: { id: string; name: string; ts?: number }) => {
		if (!dock.dialog) return

		const inactiveTime = agent.ts ? Date.now() - agent.ts : 0
		const timeText = agent.ts
			? `Agent has been inactive for ${formatDuration(inactiveTime)}.`
			: 'Agent has never been seen.'

		const confirmed = await dock.dialog.confirm({
			title: `Dismiss ${agent.name}?`,
			message: `${timeText} Dismissing will kick them from all channels.`,
		})

		if (confirmed) {
			await dismissAgent(agent.name)
		}
	}

	const renderStatus = (ts?: number) => {
		if (!ts) return <span class="status-never">Never seen</span>
		const diff = Date.now() - ts
		if (diff < 10000) return <span class="status-online">Online</span>
		return <span class="status-offline">{formatTimestamp(ts)}</span>
	}

	return (
		<div class="agents-panel">
			<header>
				<h3>Agents</h3>
				<div class="count">Total: {mcpAgents.length}</div>
			</header>

			<table class="striped">
				<thead>
					<tr>
						<th>Name</th>
						<th>Last seen</th>
						<th class="actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					<for each={sorted()}>
						{(agent) => (
							<tr>
								<td>
									<span style={{ fontWeight: agent.name === settings.agent ? 'bold' : 'normal' }}>
										{agent.name} {agent.name === settings.agent ? '(You)' : ''}
									</span>
								</td>
								<td>{renderStatus(agent.ts)}</td>
								<td class="actions">
									<button class="outline contrast dismiss-btn" onClick={() => kick(agent)}>
										Dismiss
									</button>
								</td>
							</tr>
						)}
					</for>
					<tr if={mcpAgents.length === 0}>
						<td colSpan={3} class="empty-row">
							No agents discovered yet.
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}

export default AgentsWidget
