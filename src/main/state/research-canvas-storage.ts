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
const RESEARCH_CANVAS_STORAGE_PREFIXES = [
  'sherlock.research.canvas.files.v1:',
  'sherlock.research.canvas.artifacts.v1:',
  'sherlock.research.canvas.selection.v1:',
  'sherlock.research.canvas.viewport.v1:',
  'ework.research.grid.v1:',
  'ework.research.presentation.v1:',
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
    RESEARCH_CANVAS_STORAGE_PREFIXES.some(
      (prefix) => value.startsWith(prefix) && value.length > prefix.length
    )
}

function validResearchCanvasStorageValue(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= RESEARCH_CANVAS_STORAGE_MAX_VALUE_LENGTH
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
    if (key.startsWith('sherlock.research.canvas.viewport.v1:') && value.length > 256) return false
    if (key.startsWith('ework.session.view.v1:') && !['', 'chat', 'research', 'notes', 'trajectory'].includes(value)) return false
    if (key.startsWith('ework.research.table-columns.v1:') && !validTableColumnPreference(value)) return false
    if (key.startsWith('ework.research.presentation.v1:')) {
      try {
        const preference = JSON.parse(value)
        if (value.length > 128 || !preference || Array.isArray(preference) ||
            Object.keys(preference).length !== 2 || preference.version !== 1 ||
            !['light', 'dark', 'enterprise'].includes(preference.mode)) return false
      } catch { return false }
    }
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
          (key.startsWith('sherlock.research.canvas.viewport.v1:') && record.value.length > 256) ||
          (key.startsWith('ework.session.view.v1:') && !['', 'chat', 'research', 'notes', 'trajectory'].includes(record.value)) ||
          (key.startsWith('ework.research.table-columns.v1:') && !validTableColumnPreference(record.value))) return null
      return record.value
    } catch {
      return null
    }
  }
}
