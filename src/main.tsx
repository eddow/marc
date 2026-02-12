import '@pounce/core'
import { bindApp } from '@pounce/core'
import { A, Router } from '@pounce/kit'
import { setAdapter } from '@pounce/ui'
import { picoAdapter } from '@pounce/adapter-pico'
import '@pounce/adapter-pico/css'
import './styles/app.sass'
import Dashboard from './routes/dashboard'
import ChannelView from './routes/channel'
import StreamView from './routes/stream'
import AgentsDashboard from './routes/agents'

setAdapter(picoAdapter)

const routes = [
	{
		path: '/channel/[name]',
		view: (spec: { params: Record<string, string> }) =>
			<ChannelView name={spec.params.name} />,
	},
	{
		path: '/all',
		view: () => <StreamView />,
	},
	{
		path: '/agents',
		view: () => <AgentsDashboard />,
	},
	{
		path: '/',
		view: () => <Dashboard />,
	},
] as const

const notFound = (ctx: { url: string; routes: readonly unknown[] }) => (
	<section style="text-align: center; padding: 4rem;">
		<h1>404</h1>
		<p>No route for <code>{ctx.url}</code></p>
		<A href="/">← Back to mARC</A>
	</section>
)

const App = () => (
	<main class="container" style="padding-top: 1.5rem; padding-bottom: 1.5rem;">
		<Router routes={routes} notFound={notFound} />
	</main>
)

bindApp(<App />, '#app')
