import { effect } from 'mutts'
import { A } from '@pounce/kit'
import { channels, fetchChannel, subscribeChannel, parseMessages, settings, setAgentName } from '../state'
import Message from '../components/message'
import InputBar from '../components/input-bar'

type ChannelViewProps = {
	name: string
}

const ChannelView = (props: ChannelViewProps) => {
	const name = props.name
	const isStream = name === 'stream'

	fetchChannel(name)
	const unsub = subscribeChannel(name)

	let messagesEl: HTMLDivElement | undefined
	let stickToBottom = true

	const scrollToBottom = () => {
		if (messagesEl && stickToBottom) {
			messagesEl.scrollTop = messagesEl.scrollHeight
		}
	}

	const onScroll = () => {
		if (!messagesEl) return
		const { scrollTop, scrollHeight, clientHeight } = messagesEl
		stickToBottom = scrollHeight - scrollTop - clientHeight < 30
	}

	effect(() => {
		const _ = channels[name]
		requestAnimationFrame(scrollToBottom)
	})

	return (
		<div style="display: flex; flex-direction: column; height: calc(100vh - 3rem); min-height: 0;">
			<header style="position: relative; display: flex; align-items: center; gap: 1rem; padding-bottom: 0.5rem; flex-shrink: 0;">
				<A href="/" style="text-decoration: none;">← Back</A>
				<h2 style="margin: 0;">#{name}</h2>
				<span style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 0.75em; opacity: 0.45; white-space: nowrap;" if={!isStream}>
					as <input
						type="text"
						class="pounce-input-inline"
						value={settings.agent}
						onBlur={(e: FocusEvent) => setAgentName((e.target as HTMLInputElement).value)}
						style="width: 6rem; font-size: 1em;"
					/>
				</span>
				<span style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 0.75em; opacity: 0.4;" if={isStream}>read-only</span>
			</header>
			<div
				this={messagesEl}
				style="flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--pico-muted-border-color, #333); border-radius: var(--pico-border-radius, 0.25rem); padding: 0.5rem;"
				use={(el: HTMLDivElement) => {
					el.addEventListener('scroll', onScroll)
					return () => el.removeEventListener('scroll', onScroll)
				}}
			>
				<for each={parseMessages(channels[name] ?? '')}>{(msg) =>
					<Message message={msg} />
				}</for>
				<p style="text-align: center; opacity: 0.4; padding: 2rem;" if={!channels[name]}>
					<em>No messages yet</em>
				</p>
			</div>
			<InputBar channel={name} if={!isStream} />
		</div>
	)
}

export default ChannelView
