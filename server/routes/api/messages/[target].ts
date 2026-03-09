import { expose, type PounceRequest } from 'board'
import { messagesForTarget } from '../../../store.js'

export default expose<{ target: string }>({
	async get(req: PounceRequest<{ target: string }>) {
		return messagesForTarget(req.params.target)
	},
})
