import { expose, type SursautRequest } from 'board'
import { errata } from '../../store.js'

export default expose({
	async post(req: SursautRequest) {
		const body = await req.raw.json()
		const { messageId, newMessage } = body
		if (!messageId || !newMessage) return { status: 400, error: 'Missing messageId or newMessage' }
		const ok = errata(messageId, newMessage)
		return { ok }
	},
})
