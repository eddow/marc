import { expose, type PounceRequest } from 'board'
import { getUsers } from '../../../store.js'

export default expose<{ target: string }>({
	async get(req: PounceRequest<{ target: string }>) {
		return getUsers(req.params.target)
	},
})
