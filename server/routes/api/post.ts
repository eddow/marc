import type { RequestContext } from 'board'
import { post as storePost } from '../../store.js'

export async function post(ctx: RequestContext) {
	const body = await ctx.request.json()
	const { name, target, message, type } = body
	if (!name || !target || !message)
		return { status: 400, error: 'Missing name, target, or message' }
	const id = storePost(name, target, message, type)
	return { status: 200, data: { ok: true, id } }
}
