import '@pounce/core'
import { bindApp } from '@pounce/core'
import { reactive } from 'mutts'
import { Orientation, type DockviewApi, type SerializedDockview } from 'dockview-core'
import { Dockview, WithOverlays, bindDialog } from '@pounce/ui'
import { setAdapter } from '@pounce/ui'
import { picoAdapter } from '@pounce/adapter-pico'
import '@pounce/adapter-pico/css'
import 'dockview-core/dist/styles/dockview.css'
import './styles/app.sass'
import ChannelWidget from './routes/channel'
import AgentsWidget from './routes/agents'
import ChannelsWidget from './routes/channels'
import StreamWidget from './routes/stream'
import Toolbar from './components/toolbar'
import { dock } from './dock'
import logo from './assets/logo.png'
import { fetchMessages, subscribeAll } from './state'

setAdapter(picoAdapter)

// Global data init
fetchMessages()
subscribeAll()

// Layout persistence
const LAYOUT_KEY = 'marc:layout'
const stored = localStorage.getItem(LAYOUT_KEY)

const defaultLayout: SerializedDockview = {
	grid: {
		root: {
			type: 'branch',
			data: [{
				type: 'leaf',
				data: {
					views: ['agents'],
					activeView: 'agents',
					id: 'default-group',
				},
				size: 1,
			}],
		},
		width: 800,
		height: 600,
		orientation: Orientation.HORIZONTAL,
	},
	panels: {
		agents: { id: 'agents', contentComponent: 'agents', title: 'Agents' },
	},
}

const state = reactive({
	layout: (stored ? JSON.parse(stored) : defaultLayout) as SerializedDockview,
})

const widgets = {
	channel: ChannelWidget,
	agents: AgentsWidget,
	channels: ChannelsWidget,
	stream: StreamWidget,
}

const DockviewWrapper = (_props: Record<string, never>, scope: Record<string, any>) => {
	// Intercept scope.api assignment from Dockview's initDockview
	Object.defineProperty(scope, 'api', {
		configurable: true,
		set(api: DockviewApi) {
			// Replace with plain value
			Object.defineProperty(scope, 'api', { value: api, writable: true, configurable: true, enumerable: true })
			dock.api = api
			api.onDidLayoutChange(() => {
				localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
			})
		},
		get() { return undefined },
	})
	return (
		<Dockview
			el={{ style: 'flex: 1; min-height: 0;' }}
			widgets={widgets}
			layout={state.layout}
		/>
	)
}

const App = (_props: Record<string, never>, scope: Record<string, any>) => {
	// Capture dialog helper for toolbar/widgets
	const captureDialog = () => {
		requestAnimationFrame(() => { dock.dialog = scope.dialog })
	}
	return (
		<div class="marc-app dockview-theme-dark" style="height: 100vh; width: 100vw; display: flex; flex-direction: column;" use={captureDialog}>
			<header class="marc-header" style="padding: 0.25rem 0.75rem;">
				<div style="display: flex; align-items: center; gap: 0.75rem;">
					<img src={logo} alt="mARC logo" style="height: 2.8rem; width: auto;" title="mARC" />
					<span style="opacity: 0.5; font-size: 0.7em;">mcp Agent Relay Chat</span>
				</div>
				<Toolbar />
			</header>
			<DockviewWrapper />
		</div>
	)
}

bindApp(
	<WithOverlays extend={{ dialog: bindDialog }}>
		<App />
	</WithOverlays>,
	'#app'
)

