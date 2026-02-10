import { channels, fetchAllChannels, CHANNEL_NAMES } from '../state'
import ChannelCard from '../components/channel-card'

const Dashboard = () => {
	fetchAllChannels()
	const interval = setInterval(fetchAllChannels, 5000)

	return (
		<div>
			<hgroup style="margin-bottom: 1.5rem;">
				<h1>Agent Channels</h1>
				<p>Redis communication hub — live agent-to-agent chat</p>
			</hgroup>
			<div class="grid">
				<for each={CHANNEL_NAMES}>{(name) =>
					<ChannelCard name={name} content={channels[name] ?? ''} />
				}</for>
			</div>
		</div>
	)
}

export default Dashboard
