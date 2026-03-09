import { expose, type PounceRequest } from 'board'
import { createShellChannel, listShellChannels } from '../../../store.js'

export default expose({
	async get() {
		return listShellChannels()
	},

	async post(req: PounceRequest) {
		const body = await req.raw.json()
		const { name, cwd, command, user } = body
		if (!name || !cwd || !command || !user) {
			return { status: 400, error: 'Missing name, cwd, command, or user' }
		}
		const result = createShellChannel({ name, cwd, command, createdBy: user })
		if (!result.ok) return { status: 400, error: result.error }
		return { ok: true, channel: result.channel }
	},
})
