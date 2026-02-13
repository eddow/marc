import { effect, reactive } from 'mutts'
import { componentStyle } from '@pounce/kit/dom'
import { fetchBriefing, setBriefingApi, formatTimestamp } from '../state'
import type { DockviewWidgetProps } from '@pounce/ui'

componentStyle.css`
.briefing-panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	padding: 0.5rem;
}
.briefing-panel header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.5rem;
	flex: none;
}
.briefing-panel header h3 {
	margin: 0;
}
.briefing-panel .briefing-meta {
	font-size: 0.75em;
	opacity: 0.5;
}
.briefing-panel textarea {
	flex: 1;
	resize: none;
	font-family: monospace;
	font-size: 0.85em;
	min-height: 0;
}
.briefing-panel footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 0.5rem;
	flex: none;
}
.briefing-panel .save-btn {
	margin: 0;
	padding: 0.3rem 1rem;
	font-size: 0.85em;
	width: auto;
}
.briefing-panel .status {
	font-size: 0.8em;
	opacity: 0.6;
}
`

const BriefingWidget = (_props: DockviewWidgetProps) => {
	const state = reactive({
		text: '',
		updatedAt: 0,
		draft: '',
		saving: false,
		loaded: false,
	})

	const isDirty = () => state.loaded && state.draft !== state.text

	const refresh = async () => {
		const briefing = await fetchBriefing()
		state.text = briefing?.text ?? ''
		state.updatedAt = briefing?.updatedAt ?? 0
		if (!state.loaded) {
			state.draft = state.text
			state.loaded = true
		}
	}

	const save = async () => {
		state.saving = true
		const ok = await setBriefingApi(state.draft)
		state.saving = false
		if (ok) {
			state.text = state.draft
			await refresh()
		}
	}

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault()
			if (isDirty()) save()
		}
	}

	effect(() => {
		refresh()
	})

	return (
		<div class="briefing-panel">
			<header>
				<h3>Briefing</h3>
				<span class="briefing-meta" if={state.updatedAt > 0}>
					Last updated: {formatTimestamp(state.updatedAt)}
				</span>
			</header>
			<textarea
				value={state.draft}
				onInput={(e: Event) => { state.draft = (e.target as HTMLTextAreaElement).value }}
				onKeydown={onKeydown}
				placeholder="Write operator instructions for agents here. This will be delivered to agents via getNews when updated."
			/>
			<footer>
				<span class="status" if={isDirty()}>Unsaved changes</span>
				<button
					class="save-btn"
					onClick={save}
					disabled={!isDirty() || state.saving}
				>
					{state.saving ? 'Saving...' : 'Save'}
				</button>
			</footer>
		</div>
	)
}

export default BriefingWidget
