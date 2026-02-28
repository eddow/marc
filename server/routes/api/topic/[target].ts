import type { RequestContext } from 'board'
import { getTopic } from '../../../store.js'

export async function get(ctx: RequestContext) {
	return { status: 200, data: getTopic(ctx.params.target) }
}
