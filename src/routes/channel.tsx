import { effect, reactive } from 'mutts'
import { A } from '@pounce/kit'
import { fetchMessages, subscribeAll, messagesForTarget, settings, setAgentName, getUsers, dismissAgent } from '../state'
import MessageView from '../components/message'
import InputBar from '../components/input-bar'

type ChannelViewProps = {
	name: string
}

const ChannelView = (props: ChannelViewProps) => {
	const target = decodeURIComponent(props.name)

	fetchMessages()
	subscribeAll()

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
		const _ = messagesForTarget(target)
		requestAnimationFrame(scrollToBottom)
	})

	const users = reactive({ list: [] as string[] })

	const refreshUsers = async () => {
		if (target.startsWith('#')) {
			users.list = await getUsers(target)
		} else {
			users.list = []
		}
	}

	effect(() => {
		refreshUsers()
		const i = setInterval(refreshUsers, 3000)
		return () => clearInterval(i)
	})

	const kick = async (agent: string) => {
		if (confirm(`Dismiss ${agent}?`)) {
			await dismissAgent(agent)
			await refreshUsers()
		}
	}

	return (
		<div style="display: flex; flex-direction: column; height: calc(100vh - 3rem); min-height: 0;">
			<header style="position: relative; display: flex; align-items: center; gap: 1rem; padding-bottom: 0.5rem; flex-shrink: 0;">
				<A href="/" style="text-decoration: none;">← Back</A>
				<h2 style="margin: 0;">{target}</h2>
				<span style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 0.75em; opacity: 0.45; white-space: nowrap;">
					as <input
						type="text"
						class="pounce-input-inline"
						value={settings.agent}
						onBlur={(e: FocusEvent) => setAgentName((e.target as HTMLInputElement).value)}
						style="width: 6rem; font-size: 1em;"
					/>
				</span>
			</header>
			<div style="display: flex; flex: 1; min-height: 0; gap: 0.5rem;">
				<div
					this={messagesEl}
					style="flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--pico-muted-border-color, #333); border-radius: var(--pico-border-radius, 0.25rem); padding: 0.5rem;"
					use={(el: HTMLDivElement) => {
						el.addEventListener('scroll', onScroll)
						return () => el.removeEventListener('scroll', onScroll)
					}}
				>
					<for each={messagesForTarget(target)}>{(msg) =>
						<MessageView message={msg} />
					}</for>
					<p style="text-align: center; opacity: 0.4; padding: 2rem;" if={messagesForTarget(target).length === 0}>
						<em>No messages yet</em>
					</p>
				</div>
				<aside style="width: 200px; border-left: 1px solid var(--pico-muted-border-color, #333); padding-left: 0.5rem; display: flex; flex-direction: column;" if={target.startsWith('#')}>
					<h6 style="margin-bottom: 0.5rem; opacity: 0.7;">Users ({users.list.length})</h6>
					<ul style="flex: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0;">
						<for each={users.list}>{(agent) =>
							<li style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; font-size: 0.9em;">
								<span>{agent}</span>
								<button
									onClick={() => kick(agent)}
									style="padding: 0.1rem 0.3rem; font-size: 0.7em; background: var(--pico-del-color, #c00); border: none; opacity: 0.7;"
									title="Kick agent"
								>✕</button>
							</li>
						}</for>
						<li if={users.list.length === 0} style="opacity: 0.4; font-size: 0.8em;">
							<em>No agents</em>
						</li>
					</ul>
				</aside>
			</div>
			<InputBar target={target} />
		</div>
	)
}

export default ChannelView
