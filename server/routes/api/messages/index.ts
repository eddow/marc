import { expose } from 'board'
import { allMessages } from '../../../store.js'

export default expose({
	async get() {
		return allMessages()
	},
})
