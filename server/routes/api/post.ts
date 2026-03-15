import { expose, type SursautRequest } from 'board'
import { post as storePost } from '../../store.js'

export default expose({
	async post(req: SursautRequest) {
		const body = await req.raw.json()
		const { name, target, message, type } = body
		if (!name || !target || !message)
			return { status: 400, error: 'Missing name, target, or message' }
		const id = storePost(name, target, message, type)
		return { ok: true, id }
	},
})
