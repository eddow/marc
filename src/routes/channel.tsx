import { effect, reactive } from 'mutts'
import type { DockviewWidgetProps } from '@pounce/ui'
import { trail } from '@pounce/ui'
import { componentStyle } from '@pounce/kit/dom'
import { messagesForTarget, settings, getUsers, fetchTopic, setTopicApi } from '../state'
import MessageView from '../components/message'
import InputBar from '../components/input-bar'

componentStyle.css`
.channel {
	height: 100%;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	padding: 0.5rem;
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
.channel-body {
	display: flex;
	flex: 1;
	min-height: 0;
	gap: 0.5rem;
}
.channel-messages {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 0.5rem;
}
.channel-empty {
	text-align: center;
	opacity: 0.4;
	padding: 2rem;
}
.channel-aside {
	width: 200px;
	border-left: 1px solid var(--pico-muted-border-color, #333);
	padding-left: 0.5rem;
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

const ChannelWidget = (props: DockviewWidgetProps<ChannelParams>, scope: Record<string, any>) => {
	scope.trail = trail
	const target = () => props.params.target

	type User = { name: string, ts?: number }
	const users = reactive<User[]>([])
	const topic = reactive({ text: '', editing: false })
	let topicEl: HTMLSpanElement | undefined

	const refreshUsers = async () => {
		const t = target()
		if (t.startsWith('#')) {
			const list = await getUsers(t)
			users.length = 0
			users.push(...list)
		} else {
			users.length = 0
		}
	}

	const refreshTopic = async () => {
		const t = target()
		if (t.startsWith('#')) {
			const result = await fetchTopic(t)
			topic.text = result?.text ?? ''
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
		if (e.key === 'Enter') { e.preventDefault(); submitTopic() }
		if (e.key === 'Escape') cancelTopicEdit()
	}

	effect(() => {
		refreshUsers()
		refreshTopic()
		const i = setInterval(refreshUsers, 3000)
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

	return (
		<div class="channel">
			<div class="channel-topic" if={target().startsWith('#')}>
				<span
					this={topicEl}
					contentEditable={topic.editing}
					onClick={() => { if (!topic.editing) startTopicEdit() }}
					onKeydown={onTopicKeydown}
					onBlur={submitTopic}
				>{topic.text}</span>
			</div>
			<div class="channel-body">
				<div class="channel-messages" use:trail>
					<for each={messagesForTarget(target())}>{(msg) =>
						<MessageView message={msg} />
					}</for>
					<p class="channel-empty" if={messagesForTarget(target()).length === 0}>
						<em>No messages yet</em>
					</p>
				</div>
				<aside class="channel-aside" if={target().startsWith('#')}>
					<h6>Agents ({users.length})</h6>
					<ul>
						<for each={users}>{(user) =>
							<li>
								<span style={{ fontWeight: user.name === settings.agent ? 'bold' : 'normal' }}>{user.name}</span>
								{renderTimestamp(user.ts)}
							</li>
						}</for>
						<li class="empty" if={users.length === 0}>
							<em>No agents</em>
						</li>
					</ul>
				</aside>
			</div>
			<InputBar target={target()} />
		</div>
	)
}

export default ChannelWidget
