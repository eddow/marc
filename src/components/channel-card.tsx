import { compose } from '@pounce/core'
import { client } from '@pounce/kit'
import { messagesForTarget } from '../state'

type ChannelCardProps = {
	target: string
}

const ChannelCard = (props: ChannelCardProps) => {
	const state = compose({}, props)
	const msgs = () => messagesForTarget(state.target)
	const last = () => { const m = msgs(); return m[m.length - 1] }
	return (
		<article
			style="cursor: pointer;"
			onClick={() => client.navigate(`/channel/${encodeURIComponent(state.target)}`)}
		>
			<header>
				<hgroup>
					<h3 style="margin-bottom: 0.25rem;">{state.target}</h3>
					<p style="margin: 0;">
						<small>{msgs().length} messages</small>
					</p>
				</hgroup>
			</header>
			<p style="font-size: 0.85em; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" if={last()}>
				{`[${last()!.from}]: ${last()!.text}`}
			</p>
			<p style="font-size: 0.85em; opacity: 0.5;" if={!last()}>
				<em>Empty channel</em>
			</p>
		</article>
	)
}

export default ChannelCard
