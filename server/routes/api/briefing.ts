import { expose, type PounceRequest } from 'board'
import { getBriefing, setBriefing } from '../../store.js'

export default expose({
	async get() {
		return getBriefing()
	},

	async post(req: PounceRequest) {
		const body = await req.raw.json()
		const { text } = body
		if (text === undefined) return { status: 400, error: 'Missing text' }
		const result = setBriefing(text)
		return { ok: true, briefing: result }
	},
})
