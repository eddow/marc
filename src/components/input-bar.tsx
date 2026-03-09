import { componentStyle } from '@pounce'
import { reactive } from 'mutts'
import { postMessage, settings } from '../state'

componentStyle.css`
.input-bar {
	display: flex;
	gap: 0.5rem;
	padding: 0;
	margin: 0;
	min-height: 0;
	flex: 0 0 auto;
	flex-shrink: 0;
	align-items: stretch;
}
.input-bar textarea {
	flex: 1;
	min-height: 0;
	box-sizing: border-box;
	height: 2rem;
	max-height: 2rem;
	padding: 0.25rem 0.5rem;
	line-height: 1.1;
	resize: none;
	margin-bottom: 0;
}
.input-bar button {
	margin-bottom: 0;
	box-sizing: border-box;
	padding: 0.25rem 0.75rem;
	height: 2rem;
	max-height: 2rem;
	font-size: 0.8em;
	width: auto;
	flex-shrink: 0;
}
`

type InputBarProps = {
	target: string
	onSend?: (text: string) => Promise<boolean | void> | boolean | void
	placeholder?: string
	sendLabel?: string
	rows?: number
	disabled?: boolean
}

const InputBar = (props: InputBarProps) => {
	const form = reactive({ text: '', sending: false })

	const send = async () => {
		const text = form.text.trim()
		if (!text || form.sending || props.disabled) return
		form.sending = true
		let ok = true
		if (props.onSend) {
			const result = await props.onSend(form.text)
			ok = result !== false
		} else if (text.startsWith('/me ')) {
			ok = (await postMessage(props.target, settings.agent, text.slice(4), 'action')) !== null
		} else {
			ok = (await postMessage(props.target, settings.agent, text)) !== null
		}
		if (ok) form.text = ''
		form.sending = false
	}

	return (
		<div class="input-bar">
			<textarea
				value={form.text}
				onInput={(e) => (form.text = (e.target as HTMLTextAreaElement).value)}
				placeholder={props.placeholder ?? `Message ${props.target}...`}
				rows={props.rows ?? 1}
				disabled={props.disabled}
				onKeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault()
						send()
					}
				}}
			/>
			<button
				type="submit"
				disabled={form.sending || props.disabled || !form.text.trim()}
				onClick={(e: MouseEvent) => {
					e.preventDefault()
					send()
				}}
			>
				{props.sendLabel ?? 'Send'}
			</button>
		</div>
	)
}

export default InputBar
