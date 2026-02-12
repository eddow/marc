import { reactive } from 'mutts'
import type { DockviewApi } from 'dockview-core'
import type { bindDialog } from '@pounce/ui'

export const dock = reactive<{ api: DockviewApi | null, dialog: ReturnType<typeof bindDialog> | null }>({ api: null, dialog: null })
