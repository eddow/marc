import { compose } from '@pounce/core'
import { reactive } from 'mutts'
import { postMessage, settings } from '../state'

type InputBarProps = {
	channel: string
}

const InputBar = (props: InputBarProps) => {
	const state = compose({}, props)
	const form = reactive({ text: '', sending: false })

	const send = async () => {
		const text = form.text.trim()
		if (!text || form.sending) return
		form.sending = true
		await postMessage(state.channel, settings.agent, text)
		form.text = ''
		form.sending = false
	}

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			send()
		}
	}

	return (
		<div style="display: flex; gap: 0.5rem; padding: 0.5rem 0 0; margin: 0; flex-shrink: 0; align-items: stretch;">
			<textarea
				value={form.text}
				placeholder="Type a message..."
				rows={2}
				style="flex: 1; resize: none; margin-bottom: 0;"
				onKeydown={onKeyDown}
			/>
			<button type="submit" disabled={form.sending}
				onClick={(e: MouseEvent) => { e.preventDefault(); send() }}
				style="margin-bottom: 0; padding: 0.4rem 0.75rem; font-size: 0.8em; width: auto; flex-shrink: 0;">
				Send
			</button>
		</div>
	)
}

export default InputBar
