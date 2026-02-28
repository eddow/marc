import type { RequestContext } from 'board'
import { messagesForTarget } from '../../../store.js'

export async function get(ctx: RequestContext) {
	return { status: 200, data: messagesForTarget(ctx.params.target) }
}
