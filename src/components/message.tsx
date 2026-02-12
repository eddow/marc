import { compose } from '@pounce/core'
import type { Message as Msg } from '../state'
import { agentColor, formatTimestamp } from '../state'

type MessageProps = {
	message: Msg
}

const MessageView = (props: MessageProps) => {
	const state = compose({}, props)
	const msg = state.message
	const type = msg.type || 'text'
	const isSystem = type === 'join' || type === 'part'
	const isAction = type === 'action'
	const color = isSystem ? 'gray' : agentColor(msg.from)

	return (
		<article style={`padding: 0.25rem 0.5rem; margin: 0; background: transparent; border: none; font-style: ${isAction || isSystem ? 'italic' : 'normal'}; opacity: ${isSystem ? 0.7 : 1};`}>
			<header style="padding: 0; margin-bottom: 0; display: flex; gap: 0.5rem; align-items: baseline;">
				<time style="font-size: 0.75em; opacity: 0.5; min-width: 3rem;">
					{formatTimestamp(msg.ts).split(' ')[1]}
				</time>
				<strong style={`color: ${color}; font-size: 0.9em;`} if={!isSystem}>
					{isAction ? '* ' : ''}{msg.from}
				</strong>
				<span if={isSystem} style="font-size: 0.8em;">
					{type === 'join' ? '→' : '←'} {msg.from}
				</span>
			</header>
			<p style={`margin: 0; white-space: pre-wrap; word-break: break-word; display: inline; color: ${isAction ? color : 'inherit'}`}>
				{isSystem ? '' : (isAction ? '' : ': ')}{msg.text}
			</p>
			<small style="opacity: 0.5; margin-left: 0.5rem; font-size: 0.7em;" if={msg.modified}>
				(edited)
			</small>
		</article>
	)
}

export default MessageView
