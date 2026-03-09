import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import {
	allMessages,
	createShellChannel,
	getShellChannel,
	init,
	listShellChannels,
	sendShellInput,
	setDataDir,
	startShellChannel,
	stopShellChannel,
	storeEvents,
} from './store.js'

test('shell channels persist configuration and stream transient output', async () => {
	const sandboxRoot = resolve(process.cwd(), 'sandbox', 'tests-store')
	mkdirSync(sandboxRoot, { recursive: true })
	const dataDir = mkdtempSync(join(sandboxRoot, 'marc-shell-test-'))
	setDataDir(dataDir)
	init()

	const created = createShellChannel({
		name: '$echo',
		cwd: process.cwd(),
		command: 'stdbuf -o0 tr a-z A-Z',
		createdBy: 'human',
	})
	assert.equal(created.ok, true)
	assert.equal(
		listShellChannels().some((channel) => channel.name === '$echo'),
		true
	)

	const outputs: string[] = []
	const onMessage = (message: { target: string; type?: string; text: string }) => {
		if (message.target === '$echo' && message.type === 'shell-output') outputs.push(message.text)
	}
	storeEvents.on('message', onMessage)

	try {
		const started = startShellChannel('$echo', 'human')
		assert.equal(started.ok, true)
		assert.equal(getShellChannel('$echo')?.isRunning, true)

		const sent = sendShellInput('$echo', 'hello world\n')
		assert.equal(sent.ok, true)

		for (let i = 0; i < 100 && outputs.length === 0; i++) {
			await sleep(25)
		}

		assert.equal(outputs.includes('HELLO WORLD'), true)
		assert.equal(
			allMessages().some(
				(message) =>
					message.target === '$echo' &&
					message.type === 'shell-output' &&
					message.text === 'HELLO WORLD'
			),
			true
		)

		const stopped = stopShellChannel('$echo', 'human')
		assert.equal(stopped.ok, true)

		for (let i = 0; i < 100 && getShellChannel('$echo')?.isRunning; i++) {
			await sleep(25)
		}

		assert.equal(getShellChannel('$echo')?.isRunning, false)
	} finally {
		storeEvents.off('message', onMessage)
	}
})
