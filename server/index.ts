import { fileURLToPath } from 'node:url'
import { resolveMarcConfig } from './config.js'
import { startMarcDaemon } from './daemon.js'

export { startMarcDaemon } from './daemon.js'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await startMarcDaemon(resolveMarcConfig())
}
