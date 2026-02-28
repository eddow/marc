import type { RequestContext } from 'board'
import { getMcpAgents } from '../../store.js'

export async function get(_ctx: RequestContext) {
	return { status: 200, data: getMcpAgents() }
}
