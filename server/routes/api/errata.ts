import type { RequestContext } from 'board'
import { errata } from '../../store.js'

export async function post(ctx: RequestContext) {
	const body = await ctx.request.json()
	const { messageId, newMessage } = body
	if (!messageId || !newMessage) return { status: 400, error: 'Missing messageId or newMessage' }
	const ok = errata(messageId, newMessage)
	return { status: 200, data: { ok } }
}
