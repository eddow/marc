import type { RequestContext } from 'board'
import { sync as storeSync } from '../../../store.js'

export async function get(ctx: RequestContext) {
	return { status: 200, data: storeSync(ctx.params.name) }
}
