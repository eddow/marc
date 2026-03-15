import { componentStyle } from '@sursaut/kit'
import type { DockviewWidgetProps } from '@sursaut/ui/dockview'
import { effect, reactive } from 'mutts'
import InputBar from '../components/input-bar'
import MessageView from '../components/message'
import {
	fetchTopic,
	getShellChannel,
	getUsers,
	messagesForTarget,
	restartShellChannel,
	postMessage as sendMessage,
	sendShellInput,
	setTopicApi,
	settings,
	startShellChannel,
	stopShellChannel,
} from '../state'

componentStyle.css`
.channel {
	width: 100%;
	height: 100%;
	min-height: 0;
	min-width: 0;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	box-sizing: border-box;
}
.channel-topic {
	padding: 0.25rem 0.5rem;
	font-size: 0.85em;
	opacity: 0.7;
	border-bottom: 1px solid var(--pico-muted-border-color, #333);
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 1.5em;
}
.channel-topic span {
	flex: 1;
	cursor: pointer;
}
.channel-topic span:empty::before {
	content: 'Set a topic...';
	opacity: 0.4;
	font-style: italic;
}
.channel-topic span[contenteditable="true"] {
	outline: 1px solid var(--pico-primary, #1095c1);
	border-radius: 2px;
	padding: 0.1rem 0.3rem;
	opacity: 1;
}
.channel-shell {
	padding: 0.5rem 0.75rem;
	border-bottom: 1px solid var(--pico-muted-border-color, #333);
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	flex-wrap: wrap;
	background: color-mix(in srgb, var(--pico-card-background-color, #1a1f29) 80%, transparent);
}
.channel-shell-meta {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	min-width: 0;
}
.channel-shell-target {
	font-weight: 700;
	font-size: 0.95rem;
	letter-spacing: 0.02em;
}
.channel-shell-command,
.channel-shell-status {
	font-family: var(--pico-font-family-monospace, monospace);
	font-size: 0.8rem;
	opacity: 0.72;
	word-break: break-all;
}
.channel-shell-actions {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-left: auto;
}
.channel-shell-actions button {
	margin: 0;
	width: auto;
	padding: 0.35rem 0.75rem;
	font-size: 0.8rem;
}
.channel-body {
	display: flex;
	flex: 1 1 0;
	min-height: 0;
	gap: 0.5rem;
	overflow: hidden;
}
.channel-messages {
	flex: 1 1 0;
	min-height: 0;
	min-width: 0;
	display: flex;
	flex-direction: column;
	overflow-y: scroll;
	overflow-x: hidden;
	padding: 0 0.5rem 0.5rem;
}
.channel-empty {
	text-align: center;
	opacity: 0.4;
	padding: 2rem;
}
.channel-aside {
	width: 200px;
	min-width: 0;
	min-height: 0;
	border-left: 1px solid var(--pico-muted-border-color, #333);
	padding: 0 0 0.5rem 0.5rem;
	display: flex;
	flex-direction: column;
}
.channel-aside h6 {
	margin-bottom: 0.5rem;
	opacity: 0.7;
}
.channel-aside ul {
	flex: 1;
	overflow-y: auto;
	list-style: none;
	padding: 0;
	margin: 0;
}
.channel-aside li {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	margin-bottom: 0.6rem;
	font-size: 0.9em;
}
.channel-aside .empty {
	opacity: 0.4;
	font-size: 0.8em;
}
.agent-online {
	color: var(--pico-ins-color, #0a0);
	font-weight: bold;
	font-size: 0.8em;
}
.agent-time {
	opacity: 0.5;
	font-size: 0.8em;
}
`

type ChannelParams = { target: string }

const ChannelWidget = (props: DockviewWidgetProps<ChannelParams>) => {
	const target = () => props.params.target
	const isShellTarget = () => target().startsWith('$')
	const shellChannel = () => getShellChannel(target())

	type User = { name: string; ts?: number }
	const users = reactive<User[]>([])
	const topic = reactive({ text: '', editing: false })
	let topicEl: HTMLSpanElement | undefined

	const refreshUsers = async (t: string) => {
		if (t.startsWith('#')) {
			const list = await getUsers(t)
			users.length = 0
			users.push(...list)
		} else {
			users.length = 0
		}
	}

	const refreshTopic = async (t: string) => {
		if (t.startsWith('#')) {
			const result = await fetchTopic(t)
			topic.text = result?.text ?? ''
		} else {
			topic.text = ''
		}
	}

	const startTopicEdit = () => {
		topic.editing = true
		requestAnimationFrame(() => topicEl?.focus())
	}

	const cancelTopicEdit = () => {
		topic.editing = false
		if (topicEl) topicEl.textContent = topic.text
	}

	const submitTopic = async () => {
		const newText = topicEl?.textContent?.trim() ?? ''
		topic.editing = false
		if (newText === topic.text) return
		await setTopicApi(target(), newText)
		topic.text = newText
	}

	const onTopicKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			submitTopic()
		}
		if (e.key === 'Escape') cancelTopicEdit()
	}

	effect`channel:presence`(() => {
		const t = target()
		refreshUsers(t)
		refreshTopic(t)
		const i = setInterval(() => {
			refreshUsers(t)
		}, 3000)
		return () => clearInterval(i)
	})

	const renderTimestamp = (ts?: number) => {
		if (!ts) return ''
		const diff = Date.now() - ts
		if (diff < 10000) return <span class="agent-online">[online]</span>
		const d = new Date(ts)
		const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
		return <span class="agent-time">{timeStr}</span>
	}

	const shellStatus = () => {
		const current = shellChannel()
		if (!current) return 'Unavailable'
		if (current.isRunning) return current.pid ? `RUNNING · pid ${current.pid}` : 'RUNNING'
		if (current.lastExitCode !== undefined) return `STOPPED · exit ${current.lastExitCode}`
		return 'STOPPED'
	}

	const shellCommand = () => {
		const current = shellChannel()
		if (!current) return 'Missing shell channel configuration'
		return `${current.cwd} $ ${current.command}`
	}

	const sendToShell = async (text: string) => {
		return sendShellInput(target(), text.endsWith('\n') ? text : `${text}\n`)
	}

	const displayMessages = reactive<{ msg: import('../state').Message; compact: boolean }[]>([])
	effect`channel:displayMessages`(() => {
		const list = messagesForTarget(target())
		const mapped = list.map((msg, i) => {
			const prev = list[i - 1]
			const isShell = msg.type === 'shell-output' || msg.type === 'shell-error'
			const compact = !!(
				prev &&
				isShell &&
				prev.from === msg.from &&
				(prev.type === 'shell-output' || prev.type === 'shell-error')
			)
			return { msg, compact }
		})
		displayMessages.splice(0, displayMessages.length, ...mapped)
	})

	return (
		<div class="channel">
			<div class="channel-topic" if={target().startsWith('#')}>
				<span
					this={topicEl}
					contentEditable={topic.editing}
					onClick={() => {
						if (!topic.editing) startTopicEdit()
					}}
					onKeydown={onTopicKeydown}
					onBlur={submitTopic}
				>
					{topic.text}
				</span>
			</div>
			<div class="channel-shell" if={isShellTarget()}>
				<div class="channel-shell-meta">
					<span class="channel-shell-target">{target()}</span>
					<span class="channel-shell-command">{shellCommand()}</span>
					<span class="channel-shell-status">{shellStatus()}</span>
				</div>
				<div class="channel-shell-actions">
					<button
						class="outline"
						onClick={() => startShellChannel(target())}
						disabled={shellChannel()?.isRunning}
					>
						Start
					</button>
					<button
						class="outline contrast"
						onClick={() => restartShellChannel(target())}
						disabled={!shellChannel()}
					>
						Restart
					</button>
					<button
						class="outline secondary"
						onClick={() => stopShellChannel(target())}
						disabled={!shellChannel()?.isRunning}
					>
						Stop
					</button>
				</div>
			</div>
			<div class="channel-body">
				<div class="channel-messages" use:tail>
					<for each={displayMessages}>
						{({ msg, compact }) => <MessageView message={msg} compact={compact} />}
					</for>
					<p class="channel-empty" if={messagesForTarget(target()).length === 0}>
						<em>No messages yet</em>
					</p>
				</div>
				<aside class="channel-aside" if={target().startsWith('#')}>
					<h6>Agents ({users.length})</h6>
					<ul>
						<for each={users}>
							{(user) => (
								<li>
									<span style={{ fontWeight: user.name === settings.agent ? 'bold' : 'normal' }}>
										{user.name}
									</span>
									{renderTimestamp(user.ts)}
								</li>
							)}
						</for>
						<li class="empty" if={users.length === 0}>
							<em>No agents</em>
						</li>
					</ul>
				</aside>
			</div>
			<InputBar
				target={target()}
				onSend={
					isShellTarget()
						? sendToShell
						: async (text: string) => {
								const t = target()
								const type = text.startsWith('/me ') ? ('action' as const) : ('text' as const)
								const body = type === 'action' ? text.slice(4) : text
								return (await sendMessage(t, settings.agent, body, type)) !== null
							}
				}
				placeholder={isShellTarget() ? `Send stdin to ${target()}...` : `Message ${target()}...`}
				sendLabel={isShellTarget() ? 'Write' : 'Send'}
				disabled={isShellTarget() && !shellChannel()?.isRunning}
			/>
		</div>
	)
}

export default ChannelWidget
