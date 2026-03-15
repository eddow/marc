import { expose, type SursautRequest } from 'board'
import { getUsers } from '../../../store.js'

export default expose<{ target: string }>({
	async get(req: SursautRequest<{ target: string }>) {
		return getUsers(req.params.target)
	},
})
