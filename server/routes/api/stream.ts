import { defineStreamRoute } from 'board'
import { allMessages, getMcpAgents, storeEvents, type Briefing, type Message, type Topic } from '../../store.js'

export const get = defineStreamRoute((_ctx, send) => {
	// Initial snapshots
	send({ type: 'messages', data: allMessages() })
	send({ type: 'agents', data: getMcpAgents() })

	const onMessage = (message: Message) => {
		send({ type: 'message', data: message })
	}
	const onAgents = (agentList: ReturnType<typeof getMcpAgents>) => {
		send({ type: 'agents', data: agentList })
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

	storeEvents.on('message', onMessage)
	storeEvents.on('agents', onAgents)
	storeEvents.on('topic', onTopic)
	storeEvents.on('briefing', onBriefing)
	storeEvents.on('channelDeleted', onChannelDeleted)

	return () => {
		storeEvents.off('message', onMessage)
		storeEvents.off('agents', onAgents)
		storeEvents.off('topic', onTopic)
		storeEvents.off('briefing', onBriefing)
		storeEvents.off('channelDeleted', onChannelDeleted)
	}
})
