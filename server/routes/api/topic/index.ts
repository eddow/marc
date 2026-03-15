import { expose, type SursautRequest } from 'board'
import { setTopic } from '../../../store.js'

export default expose({
	async post(req: SursautRequest) {
		const body = await req.raw.json()
		const { name, target, topic } = body
		if (!target || topic === undefined) return { status: 400, error: 'Missing target or topic' }
		const result = setTopic(name || 'human', target, topic)
		return { ok: true, topic: result }
	},
})
