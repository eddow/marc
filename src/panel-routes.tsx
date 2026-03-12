import {
	buildRoute,
	type ClientRouteDefinition,
	client,
	type DockviewWidgetProps,
	type RouterModelRouteDefinition,
} from '@pounce'
import { Orientation, type SerializedDockview } from 'dockview-core'
import AgentsWidget from './routes/agents'
import BriefingWidget from './routes/briefing'
import ChannelWidget from './routes/channel'
import ChannelsWidget from './routes/channels'
import StreamWidget from './routes/stream'

export const panelPaths = {
	agents: '/agents',
	briefing: '/briefing',
	channel: '/channel?target=[target]',
	channels: '/channels',
	stream: '/stream',
} as const

type MarcPanelRoute = ClientRouteDefinition

type DockviewPanelSnapshot = {
	id: string
	contentComponent: string
	tabComponent?: string
	title?: string
	params?: Record<string, string>
}

type DockviewLeafNode = {
	type: 'leaf'
	data: {
		id: string
		views: string[]
		activeView?: string
	}
	size: number
}

type DockviewBranchNode = {
	type: 'branch'
	data: DockviewNode[]
	size?: number
}

type DockviewNode = DockviewLeafNode | DockviewBranchNode

type DockviewLayoutShape = SerializedDockview & {
	grid: {
		root: DockviewNode
		width: number
		height: number
		orientation: Orientation
	}
	panels: Record<string, DockviewPanelSnapshot>
}

const zeroSize = { width: 0, height: 0 }

function widgetProps<Params extends Record<string, string>>(title: string, params: Params) {
	return {
		title,
		size: zeroSize,
		params,
		context: {},
	} satisfies DockviewWidgetProps<Params>
}

export function channelPanelUrl(target: string) {
	return buildRoute(panelPaths.channel, { target })
}

export function panelUrlForComponent(
	contentComponent: string,
	params?: Record<string, string>
): string | undefined {
	switch (contentComponent) {
		case panelPaths.agents:
		case 'agents':
			return panelPaths.agents
		case panelPaths.channels:
		case 'channels':
			return panelPaths.channels
		case panelPaths.stream:
		case 'stream':
			return panelPaths.stream
		case panelPaths.briefing:
		case 'briefing':
			return panelPaths.briefing
		case panelPaths.channel:
		case 'channel': {
			const target = params?.target
			return target ? channelPanelUrl(target) : undefined
		}
		default:
			return undefined
	}
}

export const marcPanelRoutes: readonly RouterModelRouteDefinition<MarcPanelRoute>[] = [
	{
		path: panelPaths.agents,
		title: 'Agents',
		view: () => <AgentsWidget {...widgetProps('Agents', {})} />,
	},
	{
		path: panelPaths.channels,
		title: 'Channels',
		view: () => <ChannelsWidget {...widgetProps('Channels', {})} />,
	},
	{
		path: panelPaths.stream,
		title: 'All Messages',
		view: () => <StreamWidget {...widgetProps('All Messages', {})} />,
	},
	{
		path: panelPaths.briefing,
		title: 'Briefing',
		view: () => <BriefingWidget {...widgetProps('Briefing', {})} />,
	},
	{
		path: panelPaths.channel,
		title: (params) => params.target,
		view: (specification) => (
			<ChannelWidget
				{...widgetProps(specification.params.target, { target: specification.params.target })}
			/>
		),
	},
]

function normalizePanel(panel: DockviewPanelSnapshot): DockviewPanelSnapshot {
	const url = panel.params?.url ?? panelUrlForComponent(panel.contentComponent, panel.params)
	if (!url) return panel
	const nextComponent =
		panel.contentComponent === 'agents' || panel.contentComponent === panelPaths.agents
			? panelPaths.agents
			: panel.contentComponent === 'channels' || panel.contentComponent === panelPaths.channels
				? panelPaths.channels
				: panel.contentComponent === 'stream' || panel.contentComponent === panelPaths.stream
					? panelPaths.stream
					: panel.contentComponent === 'briefing' || panel.contentComponent === panelPaths.briefing
						? panelPaths.briefing
						: panelPaths.channel
	return {
		...panel,
		id: url,
		contentComponent: nextComponent,
		title: panel.title ?? panel.params?.target ?? url,
		params: {
			...(panel.params ?? {}),
			...(nextComponent === panelPaths.channel && panel.params?.target
				? { target: panel.params.target }
				: {}),
			url,
			routeId: url,
		},
	}
}

function rewriteNode(node: DockviewNode, idMap: ReadonlyMap<string, string>) {
	if (node.type === 'leaf') {
		node.data.views = node.data.views.map((view) => idMap.get(view) ?? view)
		if (node.data.activeView)
			node.data.activeView = idMap.get(node.data.activeView) ?? node.data.activeView
		return
	}
	for (const child of node.data) rewriteNode(child, idMap)
}

function findActiveView(node: DockviewNode): string | undefined {
	if (node.type === 'leaf') return node.data.activeView ?? node.data.views[0]
	for (const child of node.data) {
		const active = findActiveView(child)
		if (active) return active
	}
	return undefined
}

export function normalizeDockviewLayout(layout: SerializedDockview): SerializedDockview {
	const next = JSON.parse(JSON.stringify(layout)) as DockviewLayoutShape
	const idMap = new Map<string, string>()
	const panels = Object.entries(next.panels)
	next.panels = Object.fromEntries(
		panels.map(([panelId, panel]) => {
			const normalized = normalizePanel(panel)
			idMap.set(panelId, normalized.id)
			return [normalized.id, normalized]
		})
	)
	rewriteNode(next.grid.root, idMap)
	return next
}

export function defaultMarcLayout(): SerializedDockview {
	return {
		grid: {
			root: {
				type: 'branch',
				data: [
					{
						type: 'leaf',
						data: {
							views: [panelPaths.agents],
							activeView: panelPaths.agents,
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
			[panelPaths.agents]: {
				id: panelPaths.agents,
				contentComponent: panelPaths.agents,
				title: 'Agents',
				params: { url: panelPaths.agents, routeId: panelPaths.agents },
			},
		},
	}
}

export function getInitialPanelUrl(layout: SerializedDockview): string {
	const normalized = layout as DockviewLayoutShape
	const activeId = findActiveView(normalized.grid.root)
	if (!activeId) return panelPaths.agents
	const panel = normalized.panels[activeId]
	return (
		panel?.params?.url ??
		panelUrlForComponent(panel?.contentComponent ?? '', panel?.params) ??
		panelPaths.agents
	)
}

export function getRouteId(url: string) {
	if (client.history.navigation === 'push') {
		return `${url}#${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	}
	return url
}
