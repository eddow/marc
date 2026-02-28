import type { bindDialog } from '@pounce'
import type { DockviewApi } from 'dockview-core'
import { reactive } from 'mutts'

export const dock = reactive<{
	api: DockviewApi | null
	dialog: ReturnType<typeof bindDialog> | null
}>({ api: null, dialog: null })
