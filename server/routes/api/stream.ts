import { expose } from 'board'
import {
	allMessages,
	type Briefing,
	getMcpAgents,
	listShellChannels,
	type Message,
	type ShellChannel,
	storeEvents,
	type Topic,
} from '../../store.js'

export default expose({
	stream: async (_req) => {
		const stream = new ReadableStream({
			start(controller) {
				// Helper function to send data
				const send = <Data>(data: Data) => {
					try {
						const payload = `data: ${JSON.stringify(data)}\n\n`
						controller.enqueue(new TextEncoder().encode(payload))
					} catch (_) {
						// Ignored if controller is closed
					}
				}

				// Initial snapshots
				send({ type: 'messages', data: allMessages() })
				send({ type: 'agents', data: getMcpAgents() })
				send({ type: 'shellChannels', data: listShellChannels() })

				// Event listeners
				const onMessage = (message: Message) => {
					send({ type: 'message', data: message })
				}
				const onAgents = (agentList: ReturnType<typeof getMcpAgents>) => {
					send({ type: 'agents', data: agentList })
				}
				const onShellChannels = (shellChannels: ShellChannel[]) => {
					send({ type: 'shellChannels', data: shellChannels })
				}
				const onTopic = (ev: { target: string; topic: Topic }) => {
					send({ type: 'topic', ...ev })
				}
				const onBriefing = (briefing: Briefing) => {
					send({ type: 'briefing', briefing })
				}
				const onChannelDeleted = (target: string) => {
					send({ type: 'channelDeleted', target })
				}

				// Register event listeners
				storeEvents.on('message', onMessage)
				storeEvents.on('agents', onAgents)
				storeEvents.on('shellChannels', onShellChannels)
				storeEvents.on('topic', onTopic)
				storeEvents.on('briefing', onBriefing)
				storeEvents.on('channelDeleted', onChannelDeleted)

				// Cleanup function
				return () => {
					storeEvents.off('message', onMessage)
					storeEvents.off('agents', onAgents)
					storeEvents.off('shellChannels', onShellChannels)
					storeEvents.off('topic', onTopic)
					storeEvents.off('briefing', onBriefing)
					storeEvents.off('channelDeleted', onChannelDeleted)
				}
			},
		})

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
		})
	},
})
