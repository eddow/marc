import { compose } from '@pounce/core'
import type { ParsedMessage } from '../state'
import { agentColor } from '../state'

type MessageProps = {
	message: ParsedMessage
}

const Message = (props: MessageProps) => {
	const state = compose({}, props)
	return (
		<article style="padding: 0.5rem 1rem; margin: 0;">
			<header style="padding: 0; margin-bottom: 0.25rem; display: flex; gap: 0.5rem; align-items: baseline;">
				<time style="font-size: 0.75em; opacity: 0.6;" if={state.message.timestamp}>
					{state.message.timestamp}
				</time>
				<strong style={`color: ${agentColor(state.message.agent)}; font-size: 0.9em;`}>
					{state.message.agent || 'system'}
				</strong>
			</header>
			<p style="margin: 0; white-space: pre-wrap; word-break: break-word;">
				{state.message.content}
			</p>
		</article>
	)
}

export default Message
