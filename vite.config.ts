import { defineConfig } from 'vite'
import { resolve } from 'path'
import { sursautBarrelPlugin, sursautCorePlugin } from '@sursaut/core/plugin'

export default defineConfig({
	root: resolve(import.meta.dirname, '.'),
	base: './', // For serving from subdirectory
	plugins: [
		sursautBarrelPlugin({ skeleton: 'front-end', adapter: '@sursaut/adapter-pico' }),
		sursautCorePlugin({
			projectRoot: import.meta.dirname,
		}),
	],
	esbuild: false,
	oxc: false,
	resolve: {
		alias: [
			{ find: /^@sursaut\/core\/plugin$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/core/src/plugin/index.ts') },
			{ find: /^@sursaut\/core\/dom$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/core/src/dom/index.ts') },
			{ find: /^@sursaut\/core$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/core/src/dom/index.ts') },
			{ find: /^@sursaut\/core\/(.*)$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/core/src/$1') },
			
			{ find: /^@sursaut\/kit\/dom$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/kit/src/dom/index.ts') },
			{ find: /^@sursaut\/kit\/intl$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/kit/src/intl.tsx') },
			{ find: /^@sursaut\/kit\/api$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/kit/src/api/index.ts') },
			{ find: /^@sursaut\/kit\/models$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/kit/src/models.ts') },
			{ find: /^@sursaut\/kit$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/kit/src/dom/index.ts') },
			{ find: /^@sursaut\/kit\/(.*)$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/kit/src/$1') },

			{ find: /^@sursaut\/ui\/models$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/ui/src/models/index.ts') },
			{ find: /^@sursaut\/ui$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/ui/src/index.ts') },
			{ find: /^@sursaut\/ui\/(.*)$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/ui/src/$1') },

			{ find: /^@sursaut\/adapter-pico$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/adapters/pico/src/index.ts') },
			{ find: /^@sursaut\/adapter-pico\/(.*)$/, replacement: resolve(import.meta.dirname, '../sursaut/packages/adapters/pico/src/$1') },

			{ find: /^mutts\/debug$/, replacement: resolve(import.meta.dirname, '../mutts/debug/index.ts') },
			{ find: /^mutts$/, replacement: resolve(import.meta.dirname, '../mutts') },
			{ find: /^mutts\/(.*)$/, replacement: resolve(import.meta.dirname, '../mutts/$1') },
		],
		dedupe: ['mutts'],
		preserveSymlinks: true,
		extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
	},
	optimizeDeps: {
		exclude: ['mutts', '@sursaut/core', '@sursaut/kit', '@sursaut/kit/api', '@sursaut/ui', '@sursaut/adapter-pico'],
	},
	build: {
		// Bundle everything for standalone deployment
		rolldownOptions: {
			output: {
				keepNames: true,
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
