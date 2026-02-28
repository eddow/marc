import { componentStyle } from '@pounce'
import { reactive } from 'mutts'
import { postMessage, settings } from '../state'

componentStyle.css`
.input-bar {
	display: flex;
	gap: 0.5rem;
	padding: 0.5rem 0 0;
	margin: 0;
	flex-shrink: 0;
	align-items: stretch;
}
.input-bar textarea {
	flex: 1;
	resize: none;
	margin-bottom: 0;
}
.input-bar button {
	margin-bottom: 0;
	padding: 0.4rem 0.75rem;
	font-size: 0.8em;
	width: auto;
	flex-shrink: 0;
}
`

type InputBarProps = {
	target: string
}

const InputBar = (props: InputBarProps) => {
	const form = reactive({ text: '', sending: false })

	const send = async () => {
		const text = form.text.trim()
		if (!text || form.sending) return
		form.sending = true
		if (text.startsWith('/me ')) {
			await postMessage(props.target, settings.agent, text.slice(4), 'action')
		} else {
			await postMessage(props.target, settings.agent, text)
		}
		form.text = ''
		form.sending = false
	}

	return (
		<div class="input-bar">
			<textarea
				value={form.text}
				onInput={(e) => (form.text = (e.target as HTMLTextAreaElement).value)}
				placeholder={`Message ${props.target}...`}
				rows={2}
				onKeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault()
						send()
					}
				}}
			/>
			<button
				type="submit"
				disabled={form.sending}
				onClick={(e: MouseEvent) => {
					e.preventDefault()
					send()
				}}
			>
				Send
			</button>
		</div>
	)
}

export default InputBar
