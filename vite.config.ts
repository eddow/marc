import { defineConfig } from 'vite'
import { resolve } from 'path'
import { pounceBarrelPlugin, pounceCorePlugin } from '@pounce/core/plugin'

export default defineConfig({
	root: resolve(import.meta.dirname, '.'),
	base: './', // For serving from subdirectory
	plugins: [
		pounceBarrelPlugin({ skeleton: 'front-end', adapter: '@pounce/adapter-pico' }),
		pounceCorePlugin({
			projectRoot: import.meta.dirname,
		}),
	],
	esbuild: false,
	resolve: {
		alias: [
			{ find: /^@pounce\/core\/plugin$/, replacement: resolve(import.meta.dirname, '../pounce/packages/core/src/plugin/index.ts') },
			{ find: /^@pounce\/core\/dom$/, replacement: resolve(import.meta.dirname, '../pounce/packages/core/src/dom/index.ts') },
			{ find: /^@pounce\/core$/, replacement: resolve(import.meta.dirname, '../pounce/packages/core/src/dom/index.ts') },
			{ find: /^@pounce\/ui\/models$/, replacement: resolve(import.meta.dirname, '../pounce/packages/ui/src/models/index.ts') },
			{ find: /^@pounce\/ui$/, replacement: resolve(import.meta.dirname, '../pounce/packages/ui/src/index.ts') },
			{ find: /^@pounce\/kit\/models$/, replacement: resolve(import.meta.dirname, '../pounce/packages/kit/src/models.ts') },
			{ find: /^@pounce\/kit\/dom$/, replacement: resolve(import.meta.dirname, '../pounce/packages/kit/src/dom/index.ts') },
			{ find: /^@pounce\/kit\/api$/, replacement: resolve(import.meta.dirname, '../pounce/packages/kit/src/api/index.ts') },
			{ find: /^@pounce\/kit$/, replacement: resolve(import.meta.dirname, '../pounce/packages/kit/src/index.ts') },
			{ find: /^@pounce\/adapter-pico$/, replacement: resolve(import.meta.dirname, '../pounce/packages/adapters/pico/src/index.ts') },
			{ find: /^mutts\/debug$/, replacement: resolve(import.meta.dirname, '../mutts/debug/index.ts') },
			{ find: /^mutts$/, replacement: resolve(import.meta.dirname, '../mutts/src/index.ts') },
		],
		dedupe: ['mutts'],
		preserveSymlinks: true,
		extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
	},
	optimizeDeps: {
		exclude: ['mutts', '@pounce/core', '@pounce/kit', '@pounce/kit/api', '@pounce/ui', '@pounce/adapter-pico'],
	},
	build: {
		// Bundle everything for standalone deployment
		rollupOptions: {
			output: {
				manualChunks: undefined, // Bundle all together
			},
		},
		cssCodeSplit: false,
		sourcemap: 'inline',
	},
	server: {
		port: 5280,
		allowedHosts: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
				configure: (proxy) => {
					proxy.on('proxyReq', (_proxyReq, req, res) => {
						if (req.headers.accept?.includes('text/event-stream')) {
							res.setHeader('Cache-Control', 'no-cache')
							res.setHeader('X-Accel-Buffering', 'no')
						}
					})
				},
			},
		},
		fs: {
			allow: ['..'],
		},
	},
})
