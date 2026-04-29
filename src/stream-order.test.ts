import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Message } from './state'
import { orderedStreamMessages } from './stream-order'

function msg(partial: Omit<Message, 'type'> & { type?: Message['type'] }): Message {
	return { type: 'text', ...partial }
}

describe('orderedStreamMessages', () => {
	it('orders oldest-first by default (tie-break id)', () => {
		const a = msg({ id: 1, from: 'x', target: '#c', text: 'a', ts: 10 })
		const b = msg({ id: 2, from: 'x', target: '#c', text: 'b', ts: 20 })
		assert.deepEqual(orderedStreamMessages([b, a], '', false), [a, b])
	})

	it('newest-first reverses', () => {
		const a = msg({ id: 1, from: 'x', target: '#c', text: 'a', ts: 10 })
		const b = msg({ id: 2, from: 'x', target: '#c', text: 'b', ts: 20 })
		assert.deepEqual(orderedStreamMessages([a, b], '', true), [b, a])
	})

	it('uses modified for sort key when present', () => {
		const older = msg({ id: 1, from: 'x', target: '#c', text: 'a', ts: 100, modified: 300 })
		const newer = msg({ id: 2, from: 'x', target: '#c', text: 'b', ts: 200 })
		assert.deepEqual(orderedStreamMessages([newer, older], '', false), [newer, older])
	})

	it('filters by agent substring', () => {
		const m = msg({ id: 1, from: 'alpha-bot', target: '#c', text: 'x', ts: 1 })
		const other = msg({ id: 2, from: 'beta', target: '#c', text: 'y', ts: 2 })
		assert.deepEqual(orderedStreamMessages([m, other], 'bot', false), [m])
	})
})
