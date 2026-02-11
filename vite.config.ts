import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { pounceCorePlugin } from '@pounce/core/plugin'

const muttsEntry = resolve(import.meta.dirname, '../mutts/dist/browser.esm.js')

function forceSingleMutts(): Plugin {
	return {
		name: 'force-single-mutts',
		enforce: 'pre',
		resolveId(source) {
			// Intercept bare mutts imports
			if (source === 'mutts') return muttsEntry
		},
	}
}

export default defineConfig({
	root: resolve(import.meta.dirname, '.'),
	plugins: [
		forceSingleMutts(),
		pounceCorePlugin({
			projectRoot: import.meta.dirname,
		}),
	],
	esbuild: false,
	resolve: {
		dedupe: ['mutts'],
		alias: {
			'mutts': muttsEntry,
		},
	},
	optimizeDeps: {
		exclude: ['mutts', '@pounce/core', '@pounce/kit', '@pounce/ui', '@pounce/adapter-pico'],
	},
	server: {
		port: 5280,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
			},
		},
		fs: {
			allow: ['..'],
		},
	},
})
