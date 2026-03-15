import { expose, type SursautRequest } from 'board'
import { startShellChannel } from '../../../../store.js'

export default expose<{ name: string }>({
	async post(req: SursautRequest<{ name: string }>) {
		const body = await req.raw.json()
		const { user } = body
		if (!user) return { status: 400, error: 'Missing user' }
		const result = startShellChannel(req.params.name, user)
		if (!result.ok) return { status: 400, error: result.error }
		return { ok: true, channel: result.channel }
	},
})
