import '@picocss/pico/css/pico.min.css'
import '@pounce'
import {
	badge,
	Dockview,
	intersect,
	latch,
	loading,
	pointer,
	resize,
	rootEnv,
	scroll,
	sizeable,
	tail,
	WithOverlays,
} from '@pounce'
import { type DockviewApi, Orientation, type SerializedDockview } from 'dockview-core'
import { reactive } from 'mutts'
import 'dockview-core/dist/styles/dockview.css'
import './styles/app.sass'
import logo from './assets/logo.png'
import Toolbar from './components/toolbar'
import { dock } from './dock'
import AgentsWidget from './routes/agents'
import BriefingWidget from './routes/briefing'
import ChannelWidget from './routes/channel'
import ChannelsWidget from './routes/channels'
import StreamWidget from './routes/stream'
import { subscribeAll } from './state'

// Make all directives available in the root scope
const directives = { badge, intersect, loading, pointer, resize, sizeable, scroll, tail }
Object.assign(rootEnv, directives)

// Global data init
const unsubscribe = subscribeAll()
if (import.meta.hot) import.meta.hot.dispose(unsubscribe)

// Layout persistence
const LAYOUT_KEY = 'marc:layout'
const stored = localStorage.getItem(LAYOUT_KEY)

const defaultLayout: SerializedDockview = {
	grid: {
		root: {
			type: 'branch',
			data: [
				{
					type: 'leaf',
					data: {
						views: ['agents'],
						activeView: 'agents',
						id: 'default-group',
					},
					size: 1,
				},
			],
		},
		width: 800,
		height: 600,
		orientation: Orientation.HORIZONTAL,
	},
	panels: {
		agents: { id: 'agents', contentComponent: 'agents', title: 'Agents' },
	},
}

const parsedStorage = stored ? JSON.parse(stored) : null
const isValidLayout = parsedStorage && typeof parsedStorage === 'object' && parsedStorage.grid

const state = reactive({
	layout: (isValidLayout ? parsedStorage : defaultLayout) as SerializedDockview,
})

const widgets = {
	channel: ChannelWidget,
	agents: AgentsWidget,
	channels: ChannelsWidget,
	stream: StreamWidget,
	briefing: BriefingWidget,
}

const DockviewWrapper = (_props: Record<string, never>, scope: Record<string, any>) => {
	// Intercept scope.api assignment from Dockview's initDockview
	Object.defineProperty(scope, 'api', {
		configurable: true,
		set(api: DockviewApi) {
			// Replace with plain value
			Object.defineProperty(scope, 'api', {
				value: api,
				writable: true,
				configurable: true,
				enumerable: true,
			})
			dock.api = api
			api.onDidLayoutChange(() => {
				localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
			})
		},
		get() {
			return undefined
		},
	})
	return (
		<div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
			<Dockview el={{ style: 'flex: 1; min-height: 0;' }} widgets={widgets} layout={state.layout} />
		</div>
	)
}

const App = (_props: Record<string, never>, scope: Record<string, any>) => {
	// Capture dialog helper for toolbar/widgets
	const captureDialog = () => {
		requestAnimationFrame(() => {
			dock.dialog = scope.dialog
		})
	}
	return (
		<div
			class="marc-app dockview-theme-dark"
			style="height: 100vh; width: 100vw; display: flex; flex-direction: column; overflow: hidden;"
			use={captureDialog}
		>
			<header
				class="marc-header"
				style="height: 3rem; flex-shrink: 0; padding: 0.25rem 0.75rem; border-bottom: 1px solid var(--pico-muted-border-color);"
			>
				<div style="display: flex; align-items: center; gap: 0.75rem;">
					<img src={logo} alt="mARC logo" style="height: 2.5rem; width: auto;" title="mARC" />
					<span style="opacity: 0.5; font-size: 0.7em;">mcp Agent Relay Chat</span>
				</div>
				<Toolbar />
			</header>
			<DockviewWrapper />
		</div>
	)
}

latch(
	'#app',
	<WithOverlays>
		<App />
	</WithOverlays>
)
