import { expose, type PounceRequest } from 'board'
import { getTopic } from '../../../store.js'

export default expose<{ target: string }>({
	async get(req: PounceRequest<{ target: string }>) {
		return getTopic(req.params.target)
	},
})
