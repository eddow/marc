import { expose, type PounceRequest } from 'board'
import { sendShellInput } from '../../../../store.js'

export default expose<{ name: string }>({
	async post(req: PounceRequest<{ name: string }>) {
		const body = await req.raw.json()
		const { input } = body
		if (typeof input !== 'string') return { status: 400, error: 'Missing input' }
		const result = sendShellInput(req.params.name, input)
		if (!result.ok) return { status: 400, error: result.error }
		return { ok: true }
	},
})
