import { expose, type SursautRequest } from 'board'
import { join } from '../../store.js'

export default expose({
	async post(req: SursautRequest) {
		const body = await req.raw.json()
		const { name, target } = body
		if (!name || !target) return { status: 400, error: 'Missing name or target' }
		join(name, target)
		return { ok: true }
	},
})
