import { compose } from '@pounce/core'
import { client } from '@pounce/kit'
import { parseMessages } from '../state'

type ChannelCardProps = {
	name: string
	content: string
}

const ChannelCard = (props: ChannelCardProps) => {
	const state = compose({}, props)
	return (
		<article
			style="cursor: pointer;"
			onClick={() => client.navigate(`/channel/${state.name}`)}
		>
			<header>
				<hgroup>
					<h3 style="margin-bottom: 0.25rem;">#{state.name}</h3>
					<p style="margin: 0;">
						<small>{parseMessages(state.content).length} messages</small>
					</p>
				</hgroup>
			</header>
			<p style="font-size: 0.85em; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" if={state.content}>
				{lastLine(state.content)}
			</p>
			<p style="font-size: 0.85em; opacity: 0.5;" if={!state.content}>
				<em>Empty channel</em>
			</p>
		</article>
	)
}

function lastLine(text: string): string {
	const lines = text.split(/\n(?=\[)/)
	return lines[lines.length - 1]?.trim() ?? ''
}

export default ChannelCard
