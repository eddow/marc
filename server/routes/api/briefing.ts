import type { RequestContext } from 'board'
import { getBriefing, setBriefing } from '../../store.js'

export async function get(_ctx: RequestContext) {
	return { status: 200, data: getBriefing() }
}

export async function post(ctx: RequestContext) {
	const body = await ctx.request.json()
	const { text } = body
	if (text === undefined) return { status: 400, error: 'Missing text' }
	const result = setBriefing(text)
	return { status: 200, data: { ok: true, briefing: result } }
}
