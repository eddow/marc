import type { RequestContext } from 'board'
import { deleteChannel } from '../../../store.js'

export async function post(ctx: RequestContext) {
	const body = await ctx.request.json()
	const { name } = body
	if (!name) return { status: 400, error: 'Missing channel name' }
	deleteChannel(name)
	return { status: 200, data: { ok: true } }
}
