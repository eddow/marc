import { expose, type PounceRequest } from 'board'
import { part } from '../../store.js'

export default expose({
	async post(req: PounceRequest) {
		const body = await req.raw.json()
		const { name, target } = body
		if (!name || !target) return { status: 400, error: 'Missing name or target' }
		part(name, target)
		return { ok: true }
	},
})
