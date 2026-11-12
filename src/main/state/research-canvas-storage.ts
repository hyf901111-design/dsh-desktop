import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

const RESEARCH_CANVAS_STORAGE_DIRECTORY = 'research-canvas'
const HOME_GUIDE_SESSION_PREFIX = 'sherlock.home-guide.sessions.v1:'
const WORKBENCH_TRIAL_KEY = 'ework.research.openterminal-trial.v1'
const RESEARCH_CANVAS_STORAGE_PREFIXES = [
  HOME_GUIDE_SESSION_PREFIX,
  'sherlock.research.canvas.files.v1:',
  'sherlock.research.canvas.artifacts.v1:',
  'sherlock.research.canvas.selection.v1:',
  'sherlock.research.canvas.viewport.v1:',
  'ework.research.grid.v1:',
  'ework.research.shared-grid.v1:',
  'ework.research.zoom.v1:',
  'sherlock.workbench.auto-arrange.v1:',
  'ework.research.tabs.view.v1:',
  'ework.research.presentation.v1:',
  'ework.research.preview.v1:',
  'ework.research.table-columns.v1:',
  'sherlock.research.canvas.preview-revocations.v1:',
  'sherlock.research.session-engaged.v1:',
  'ework.session.view.v1:'
] as const
const RESEARCH_CANVAS_STORAGE_MAX_KEY_LENGTH = 1_024
const RESEARCH_CANVAS_STORAGE_MAX_FILE_BYTES = 48 * 1024 * 1024

export const RESEARCH_CANVAS_STORAGE_MAX_VALUE_LENGTH = 8 * 1024 * 1024

function validResearchCanvasStorageKey(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= RESEARCH_CANVAS_STORAGE_MAX_KEY_LENGTH &&
    (value === WORKBENCH_TRIAL_KEY || RESEARCH_CANVAS_STORAGE_PREFIXES.some(
      (prefix) => value.startsWith(prefix) && value.length > prefix.length
    ))
}

function validResearchCanvasStorageValue(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= RESEARCH_CANVAS_STORAGE_MAX_VALUE_LENGTH
}

function validWorkbenchPresentation(value: string): boolean {
  try {
    if (value.length > 128) return false
    const preference = JSON.parse(value)
    return Boolean(preference && !Array.isArray(preference) && preference.version === 1 &&
      ['light', 'dark', 'enterprise', 'openterminal'].includes(preference.mode) &&
      (Object.keys(preference).sort().join(',') === 'mode,version' ||
       Object.keys(preference).sort().join(',') === 'mode,scope,version' && preference.scope === 'board'))
  } catch { return false }
}

function validWorkbenchArrange(value: string): boolean {
  try {
    if (value.length > 128 * 1024) return false
    const state = JSON.parse(value)
    const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,256}$/.test(v)
    return Boolean(state && !Array.isArray(state) && Object.keys(state).sort().join(',') === 'done,pending' &&
      Array.isArray(state.done) && state.done.length <= 1000 && state.done.every(id) &&
      Array.isArray(state.pending) && state.pending.length <= 100 && state.pending.every((item: any) =>
        item && !Array.isArray(item) && Object.keys(item).sort().join(',') === 'id,ids' && id(item.id) &&
        Array.isArray(item.ids) && item.ids.length > 0 && item.ids.length <= 30 && item.ids.every(id)))
  } catch { return false }
}

function validTableColumnPreference(value: string): boolean {
  try {
    if (value.length > 512) return false
    const state = JSON.parse(value)
    return state === null || Boolean(state && !Array.isArray(state) && Object.keys(state).length === 2 &&
      Array.isArray(state.widths) && state.widths.length > 0 && state.widths.length <= 40 &&
      state.widths.every((width: unknown) => Number.isInteger(width) && Number(width) >= 48 && Number(width) <= 1600) &&
      Array.isArray(state.manual) && state.manual.length === state.widths.length && state.manual.every((manual: unknown) => typeof manual === 'boolean'))
  } catch { return false }
}

function validHomeGuideRegistry(key: string, value: string): boolean {
  try {
    if (value.length > RESEARCH_CANVAS_STORAGE_MAX_VALUE_LENGTH) return false
    const record = JSON.parse(value)
    const scope = decodeURIComponent(key.slice(HOME_GUIDE_SESSION_PREFIX.length))
    if (scope !== 'local' && !/^account:[^\x00-\x1f]{1,200}$/.test(scope)) return false
    if (!record || Array.isArray(record) || Object.keys(record).sort().join(',') !== 'entries,scope,version' || record.version !== 1 || record.scope !== scope || !Array.isArray(record.entries)) return false
    const ids = new Set<string>()
    return record.entries.every((entry: any) => {
      if (!entry || Array.isArray(entry) || Object.keys(entry).sort().join(',') !== 'createdAt,cwd,kind,sessionId,title' || !['board','note','ppt','report','workbench'].includes(entry.kind) || typeof entry.sessionId !== 'string' || !/^[a-zA-Z0-9:_-]{1,256}$/.test(entry.sessionId) || ids.has(entry.sessionId) || typeof entry.cwd !== 'string' || !path.isAbsolute(entry.cwd) || entry.cwd.length > 4096 || /[\x00-\x1f]/.test(entry.cwd) || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 256 || /[\x00-\x1f]/.test(entry.title) || !Number.isSafeInteger(entry.createdAt) || entry.createdAt <= 0) return false
      ids.add(entry.sessionId); return true
    })
  } catch { return false }
}

export function researchCanvasStoragePath(userDataPath: string, key: string): string {
  const digest = createHash('sha256').update(key).digest('hex')
  return path.join(userDataPath, RESEARCH_CANVAS_STORAGE_DIRECTORY, `${digest}.json`)
}

export class ResearchCanvasStorage {
  private readonly values = new Map<string, string | null>()

  constructor(private readonly userDataPath: string) {}

  getItem(key: unknown): string | null {
    if (!validResearchCanvasStorageKey(key)) return null
    if (this.values.has(key)) return this.values.get(key) ?? null

    const value = this.read(key)
    this.values.set(key, value)
    return value
  }

  setItem(key: unknown, value: unknown): boolean {
    if (!validResearchCanvasStorageKey(key) || !validResearchCanvasStorageValue(value)) {
      return false
    }
    if (key.startsWith(HOME_GUIDE_SESSION_PREFIX) && !validHomeGuideRegistry(key, value)) return false
    if (key === WORKBENCH_TRIAL_KEY && !['enabled', 'disabled'].includes(value)) return false
    if (key.startsWith('sherlock.research.canvas.viewport.v1:') && value.length > 256) return false
    if (key.startsWith('ework.research.preview.v1:') && !['preview', 'edit'].includes(value)) return false
    if (key.startsWith('ework.session.view.v1:') && !['', 'chat', 'research', 'notes', 'trajectory'].includes(value)) return false
    if (key.startsWith('ework.research.table-columns.v1:') && !validTableColumnPreference(value)) return false
    if (key.startsWith('ework.research.presentation.v1:') && !validWorkbenchPresentation(value)) return false
    if (key.startsWith('sherlock.workbench.auto-arrange.v1:') && !validWorkbenchArrange(value)) return false
    if (this.getItem(key) === value) return true

    const filePath = researchCanvasStoragePath(this.userDataPath, key)
    const temporaryPath = `${filePath}.${process.pid}.tmp`
    const serialized = `${JSON.stringify({ key, value })}\n`
    if (Buffer.byteLength(serialized, 'utf8') > RESEARCH_CANVAS_STORAGE_MAX_FILE_BYTES) {
      return false
    }

    try {
      mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
      writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 })
      renameSync(temporaryPath, filePath)
      this.values.set(key, value)
      return true
    } catch {
      try {
        rmSync(temporaryPath, { force: true })
      } catch {}
      return false
    }
  }

  private read(key: string): string | null {
    const filePath = researchCanvasStoragePath(this.userDataPath, key)
    try {
      if (statSync(filePath).size > RESEARCH_CANVAS_STORAGE_MAX_FILE_BYTES) return null
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
      const record = parsed as { key?: unknown; value?: unknown }
      if (record.key !== key || !validResearchCanvasStorageValue(record.value) ||
          (key.startsWith(HOME_GUIDE_SESSION_PREFIX) && !validHomeGuideRegistry(key, record.value)) ||
          (key === WORKBENCH_TRIAL_KEY && !['enabled', 'disabled'].includes(record.value)) ||
          (key.startsWith('sherlock.research.canvas.viewport.v1:') && record.value.length > 256) ||
          (key.startsWith('ework.research.preview.v1:') && !['preview', 'edit'].includes(record.value)) ||
          (key.startsWith('ework.session.view.v1:') && !['', 'chat', 'research', 'notes', 'trajectory'].includes(record.value)) ||
          (key.startsWith('ework.research.table-columns.v1:') && !validTableColumnPreference(record.value)) ||
          (key.startsWith('ework.research.presentation.v1:') && !validWorkbenchPresentation(record.value)) ||
          (key.startsWith('sherlock.workbench.auto-arrange.v1:') && !validWorkbenchArrange(record.value))) return null
      return record.value
    } catch {
      return null
    }
  }
}
