import { expose, type PounceRequest } from 'board'
import { sync as storeSync } from '../../../store.js'

export default expose<{ name: string }>({
	async get(req: PounceRequest<{ name: string }>) {
		return storeSync(req.params.name)
	},
})
