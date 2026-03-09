import { expose, type PounceRequest } from 'board'
import { deleteChannel } from '../../../store.js'

export default expose({
	async post(req: PounceRequest) {
		const body = await req.raw.json()
		const { name } = body
		if (!name) return { status: 400, error: 'Missing channel name' }
		deleteChannel(name)
		return { ok: true }
	},
})
