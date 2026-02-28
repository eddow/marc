import type { RequestContext } from 'board'
import { part } from '../../store.js'

export async function post(ctx: RequestContext) {
	const body = await ctx.request.json()
	const { name, target } = body
	if (!name || !target) return { status: 400, error: 'Missing name or target' }
	part(name, target)
	return { status: 200, data: { ok: true } }
}
