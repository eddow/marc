import type { RequestContext } from 'board'
import { setTopic } from '../../../store.js'

export async function post(ctx: RequestContext) {
	const body = await ctx.request.json()
	const { name, target, topic } = body
	if (!target || topic === undefined) return { status: 400, error: 'Missing target or topic' }
	const result = setTopic(name || 'human', target, topic)
	return { status: 200, data: { ok: true, topic: result } }
}
