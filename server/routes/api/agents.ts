import { expose } from 'board'
import { getMcpAgents } from '../../store.js'

export default expose({
	async get() {
		return getMcpAgents()
	},
})
