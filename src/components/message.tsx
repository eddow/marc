import { componentStyle } from '@pounce'
import { marked } from 'marked'
import { effect, reactive } from 'mutts'
import type { Message as Msg } from '../state'
import { agentColor, editMessage, formatTimestamp, settings } from '../state'

type MessageProps = { message: Msg }

const MessageView = (props: MessageProps) => {
	const msg = props.message
	const type = msg.type ?? 'text'
	const isSystem = type === 'join' || type === 'part'
	const isAction = type === 'action'
	const color = isSystem ? 'gray' : agentColor(msg.from)
	const isMine = msg.from === settings.agent
	const edit = reactive({ active: false })
	let textEl: HTMLParagraphElement | undefined

	const startEdit = () => {
		edit.active = true
		requestAnimationFrame(() => textEl?.focus())
	}

	const cancelEdit = () => {
		edit.active = false
		if (textEl) {
			Promise.resolve(marked(msg.text)).then((html) => {
				textEl!.innerHTML = html
			})
		}
	}

	const submitEdit = async () => {
		const newText = textEl?.textContent?.trim()
		if (!newText || newText === msg.text) {
			cancelEdit()
			return
		}
		await editMessage(msg.id, newText)
		edit.active = false
	}

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			submitEdit()
		}
		if (e.key === 'Escape') cancelEdit()
	}

	const mountMarkdown = (el: HTMLElement) => {
		textEl = el as HTMLParagraphElement
		effect(() => {
			const text = msg.text
			if (edit.active) {
				el.textContent = text
			} else {
				Promise.resolve(marked(text))
					.then((html) => {
						el.innerHTML = html
					})
					.catch(() => {
						el.textContent = text
					})
			}
		})
	}

	return (
		<article
			style={`padding: 0.25rem 0.5rem; margin: 0; background: transparent; border: none; font-style: ${isAction || isSystem ? 'italic' : 'normal'}; opacity: ${isSystem ? 0.7 : 1};`}
		>
			<header class="msg-header">
				<time class="msg-time">{formatTimestamp(msg.ts).split(' ')[1]}</time>
				<strong class="msg-author" style={`color: ${color}`} if={!isSystem}>
					{isAction ? '* ' : ''}
					{msg.from}
				</strong>
				<span class="msg-system" if={isSystem}>
					{type === 'join' ? '→' : '←'} {msg.from}
				</span>
				<span class="msg-actions" if={isMine && !isSystem}>
					<button onClick={startEdit} title="Edit" if={!edit.active}>
						✏️
					</button>
					<button onClick={submitEdit} title="Save" if={edit.active}>
						✅
					</button>
					<button onClick={cancelEdit} title="Cancel" if={edit.active}>
						❌
					</button>
				</span>
			</header>
			<p
				class="msg-text"
				style={`color: ${isAction ? color : 'inherit'}`}
				contentEditable={edit.active}
				use={mountMarkdown}
				onKeydown={onKeydown}
			></p>
			<small class="msg-edited" if={msg.modified}>
				(edited)
			</small>
		</article>
	)
}

export default MessageView

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
.msg-text p {
	margin-bottom: 0.5rem;
}
.msg-text p:last-child {
	margin-bottom: 0;
}
.msg-text pre {
	background: rgba(0,0,0,0.2);
	padding: 0.5rem;
	border-radius: 4px;
}
.msg-edited {
	opacity: 0.5;
	margin-left: 0.5rem;
	font-size: 0.7em;
}
.msg-actions {
	margin-left: auto;
	display: flex;
	gap: 0.25rem;
	align-items: center;
}
.msg-actions button {
	background: transparent;
	border: none;
	cursor: pointer;
	padding: 0.1rem 0.3rem;
	font-size: 0.75em;
	opacity: 0.5;
	margin: 0;
}
.msg-actions button:hover {
	opacity: 1;
}
.msg-text[contenteditable="true"] {
	outline: 1px solid var(--pico-primary, #1095c1);
	border-radius: 2px;
	padding: 0.1rem 0.3rem;
}
`
