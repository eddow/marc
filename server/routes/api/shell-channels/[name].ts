import { expose, type PounceRequest } from 'board'
import { deleteShellChannel, getShellChannel } from '../../../store.js'

export default expose<{ name: string }>({
	async get(req: PounceRequest<{ name: string }>) {
		return getShellChannel(req.params.name)
	},

	async del(req: PounceRequest<{ name: string }>) {
		const ok = deleteShellChannel(req.params.name)
		if (!ok) {
			return { status: 404, error: `Unknown shell channel: ${req.params.name}` }
		}
		return { ok: true }
	},
})
