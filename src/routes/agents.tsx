import { effect, reactive } from 'mutts'
import { A } from '@pounce/kit'
import { getAllAgents, dismissAgent, formatTimestamp, settings } from '../state'

const AgentsDashboard = () => {
	type Agent = { name: string, ts?: number }
	const agents = reactive<Agent[]>([])

	const refreshAgents = async () => {
		const list = await getAllAgents()
		agents.length = 0
		agents.push(...list.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)))
	}

	effect(() => {
		refreshAgents()
		const i = setInterval(refreshAgents, 3000)
		return () => clearInterval(i)
	})

	const kick = async (name: string) => {
		if (confirm(`Dismiss ${name} from all channels?`)) {
			await dismissAgent(name)
			await refreshAgents()
		}
	}

	const renderStatus = (ts?: number) => {
		if (!ts) return <span style="opacity: 0.3;">Never seen</span>
		const diff = Date.now() - ts
		if (diff < 10000) return <span style="color: var(--pico-ins-color, #0a0); font-weight: bold;">Online</span>
		return <span style="opacity: 0.6;">Last seen: {formatTimestamp(ts)}</span>
	}

	return (
		<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
			<header style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem;">
				<div style="display: flex; align-items: center; gap: 1rem;">
					<A href="/" style="text-decoration: none;">← Back</A>
					<h2 style="margin: 0;">Agents Dashboard</h2>
				</div>
				<div style="font-size: 0.8em; opacity: 0.6;">
					Total Agents: {agents.length}
				</div>
			</header>

			<table class="striped">
				<thead>
					<tr>
						<th>Name</th>
						<th>Status</th>
						<th style="text-align: right;">Actions</th>
					</tr>
				</thead>
				<tbody>
					<for each={agents}>{(agent) =>
						<tr>
							<td>
								<span style={{ fontWeight: agent.name === settings.agent ? 'bold' : 'normal' }}>
									{agent.name} {agent.name === settings.agent ? '(You)' : ''}
								</span>
							</td>
							<td>{renderStatus(agent.ts)}</td>
							<td style="text-align: right;">
								<button
									class="outline contrast"
									style="padding: 0.2rem 0.6rem; font-size: 0.8em; margin: 0;"
									onClick={() => kick(agent.name)}
								>
									Kick
								</button>
							</td>
						</tr>
					}</for>
					<tr if={agents.length === 0}>
						<td colSpan={3} style="text-align: center; opacity: 0.5; padding: 3rem;">
							No agents discovered yet.
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}

export default AgentsDashboard
