import { expose, type SursautRequest } from 'board'
import { getTopic } from '../../../store.js'

export default expose<{ target: string }>({
	async get(req: SursautRequest<{ target: string }>) {
		return getTopic(req.params.target)
	},
})
