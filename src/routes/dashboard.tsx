import { client } from '@pounce/kit'
import { fetchMessages, subscribeAll, targetNames } from '../state'
import ChannelCard from '../components/channel-card'

const Dashboard = () => {
	fetchMessages()
	subscribeAll()

	return (
		<div>
			<hgroup style="margin-bottom: 1.5rem;">
				<h1>mARC</h1>
				<p>Agent messaging hub — MCP-powered communication</p>
			</hgroup>
			<div class="grid">
				<for each={targetNames()}>{(target) =>
					<ChannelCard target={target} />
				}</for>
				<article
					style="cursor: pointer; border: 2px dashed var(--pico-muted-border-color); display: flex; align-items: center; justify-content: center; min-height: 100px; opacity: 0.6;"
					onClick={() => {
						const t = prompt('Enter channel name (#...) or user name:')
						if (t) client.navigate(`/channel/${encodeURIComponent(t)}`)
					}}
				>
					<strong>+ New Conversation</strong>
				</article>
			</div>
			<p style="text-align: center; opacity: 0.4; padding: 2rem;" if={targetNames().length === 0}>
				<em>No conversations yet — post a message via MCP to get started</em>
			</p>
		</div>
	)
}

export default Dashboard
