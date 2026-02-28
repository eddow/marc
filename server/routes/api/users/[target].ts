import type { RequestContext } from 'board'
import { getUsers } from '../../../store.js'

export async function get(ctx: RequestContext) {
	return { status: 200, data: getUsers(ctx.params.target) }
}
