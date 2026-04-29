import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import {
	allMessages,
	createShellChannel,
	getAllChannels,
	getShellChannel,
	getUsers,
	init,
	join as joinChannel,
	listShellChannels,
	post,
	sendShellInput,
	setAgentName,
	setDataDir,
	startShellChannel,
	stopShellChannel,
	storeEvents,
	sync,
	welcome,
} from './store.js'

function freshStore(prefix: string): void {
	const sandboxRoot = resolve(process.cwd(), 'sandbox', 'tests-store')
	mkdirSync(sandboxRoot, { recursive: true })
	setDataDir(mkdtempSync(join(sandboxRoot, prefix)))
	init()
}

test('sync only reports joined channel messages newer than the last sync', () => {
	freshStore('marc-sync-cursor-test-')
	const { agentId } = welcome()
	const renamed = setAgentName(agentId, 'sync-agent')
	assert.equal(renamed.ok, true)
	const channel = '#sync-cursor'

	post('human', channel, 'before join')
	assert.deepEqual(sync('sync-agent').messages, [])

	joinChannel('sync-agent', channel)
	post('human', channel, 'after join')

	const messages = sync('sync-agent').messages.map((message) => message.text)
	assert.equal(messages.includes('before join'), false)
	assert.equal(messages.includes(`joined ${channel}`), true)
	assert.equal(messages.includes('after join'), true)
})

test('channel users include joined MCP agents', () => {
	freshStore('marc-users-test-')
	const { agentId } = welcome()
	const renamed = setAgentName(agentId, 'present-agent')
	assert.equal(renamed.ok, true)

	joinChannel('present-agent', '#presence')

	const users = getUsers('#presence')
	assert.equal(users.length, 1)
	assert.equal(users[0].name, 'present-agent')
	assert.equal(typeof users[0].ts, 'number')
})

test('channel users ignore historical senders and stale memberships', () => {
	freshStore('marc-stale-users-test-')
	const { agentId } = welcome()
	const renamed = setAgentName(agentId, 'ghost-agent')
	assert.equal(renamed.ok, true)
	joinChannel('ghost-agent', '#haunted')

	assert.equal(
		allMessages().some(
			(message) =>
				message.from === 'ghost-agent' && message.target === '#haunted' && message.type === 'join'
		),
		true
	)

	init()

	assert.deepEqual(getUsers('#haunted'), [])
	assert.equal(getAllChannels().find((channel) => channel.name === '#haunted')?.memberCount, 0)
})

test('shell channels persist configuration and stream transient output', async () => {
	freshStore('marc-shell-test-')

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
