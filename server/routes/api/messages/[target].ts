import { expose, type SursautRequest } from 'board'
import { messagesForTarget } from '../../../store.js'

export default expose<{ target: string }>({
	async get(req: SursautRequest<{ target: string }>) {
		return messagesForTarget(req.params.target)
	},
})
