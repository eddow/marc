import { defineConfig, type PluginOption } from 'vite'
import { resolve } from 'path'
import { pounceCorePlugin } from '@pounce/plugin/configs'

export default defineConfig({
	root: resolve(import.meta.dirname, '.'),
	plugins: [
		// Cast needed: @pounce/plugin built against pounce's Vite instance (dual node_modules)
		pounceCorePlugin({
			projectRoot: import.meta.dirname,
			jsxRuntime: {
				runtime: 'automatic',
				importSource: '@pounce/core',
			},
		}) as PluginOption,
	],
	esbuild: false,
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
