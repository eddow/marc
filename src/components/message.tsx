import { compose } from '@pounce/core'
import { componentStyle } from '@pounce/kit/dom'
import type { Message as Msg } from '../state'
import { agentColor, formatTimestamp } from '../state'

componentStyle.css`
.msg-header {
	padding: 0;
	margin-top: 0;
	margin-bottom: 0;
	display: flex;
	gap: 0.5rem;
	align-items: baseline;
}
.msg-time {
	font-size: 0.75em;
	opacity: 0.5;
	min-width: 3rem;
}
.msg-author {
	font-size: 0.9em;
}
.msg-system {
	font-size: 0.8em;
}
.msg-text {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	display: inline;
}
.msg-edited {
	opacity: 0.5;
	margin-left: 0.5rem;
	font-size: 0.7em;
}
`

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
			<header class="msg-header">
				<time class="msg-time">
					{formatTimestamp(msg.ts).split(' ')[1]}
				</time>
				<strong class="msg-author" style={`color: ${color}`} if={!isSystem}>
					{isAction ? '* ' : ''}{msg.from}
				</strong>
				<span class="msg-system" if={isSystem}>
					{type === 'join' ? '→' : '←'} {msg.from}
				</span>
			</header>
			<p class="msg-text" style={`color: ${isAction ? color : 'inherit'}`}>
				{isSystem ? '' : (isAction ? '' : ': ')}{msg.text}
			</p>
			<small class="msg-edited" if={msg.modified}>
				(edited)
			</small>
		</article>
	)
}

export default MessageView
