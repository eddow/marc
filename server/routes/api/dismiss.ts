import { expose, type SursautRequest } from 'board'
import { dismiss } from '../../store.js'

export default expose({
	async post(req: SursautRequest) {
		const body = await req.raw.json()
		const { name } = body
		if (!name) return { status: 400, error: 'Missing name' }
		dismiss(name)
		return { ok: true }
	},
})
