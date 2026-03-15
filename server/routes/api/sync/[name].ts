import { expose, type SursautRequest } from 'board'
import { sync as storeSync } from '../../../store.js'

export default expose<{ name: string }>({
	async get(req: SursautRequest<{ name: string }>) {
		return storeSync(req.params.name)
	},
})
