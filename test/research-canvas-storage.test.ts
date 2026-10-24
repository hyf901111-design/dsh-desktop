import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RESEARCH_CANVAS_STORAGE_MAX_VALUE_LENGTH,
  ResearchCanvasStorage,
  researchCanvasStoragePath
} from '../src/main/state/research-canvas-storage'
import { registerPrivilegedMainWindowHandlers } from '../src/main/ipc-trust'

const temporaryDirectories: string[] = []

function temporaryUserData(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'sherlock-research-canvas-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('desktop Research canvas storage', () => {
  it('persists an account-scoped guide registry and rejects malformed or cross-scope records', () => {
    const directory = temporaryUserData(), key = 'sherlock.home-guide.sessions.v1:account%3Aowner'
    const registry = { version: 1, scope: 'account:owner', entries: [{ kind: 'board', sessionId: 'example-board', cwd: '/workspace/example', title: '自选行情示例看板', createdAt: 1 }] }
    const storage = new ResearchCanvasStorage(directory), value = JSON.stringify(registry)
    expect(storage.setItem(key, value)).toBe(true)
    expect(new ResearchCanvasStorage(directory).getItem(key)).toBe(value)
    for (const bad of [null, {...registry, scope:'account:other'}, {...registry, version:2}, {...registry, extra:true}, {...registry, entries:[...registry.entries,...registry.entries]}, {...registry, entries:[{...registry.entries[0],kind:'unknown'}]}, {...registry, entries:[{...registry.entries[0],cwd:'relative'}]}]) expect(storage.setItem(key, JSON.stringify(bad))).toBe(false)
    expect(storage.getItem(key)).toBe(value)
    writeFileSync(researchCanvasStoragePath(directory,key), JSON.stringify({key,value:JSON.stringify({...registry,scope:'account:other'})}))
    expect(new ResearchCanvasStorage(directory).getItem(key)).toBeNull()
  })

  it('persists only supported per-session tabs and clears a deleted session preference', () => {
    const directory = temporaryUserData(), key = 'ework.session.view.v1:session-tab'
    const storage = new ResearchCanvasStorage(directory)
    for (const view of ['chat', 'research', 'notes', 'trajectory']) {
      expect(storage.setItem(key, view)).toBe(true)
      expect(new ResearchCanvasStorage(directory).getItem(key)).toBe(view)
    }
    for (const value of ['unknown', '{}', 'notes '.repeat(100)]) expect(storage.setItem(key, value)).toBe(false)
    expect(storage.getItem(key)).toBe('trajectory')
    expect(storage.setItem(key, '')).toBe(true)
    expect(new ResearchCanvasStorage(directory).getItem(key)).toBe('')
    const file = researchCanvasStoragePath(directory, key)
    writeFileSync(file, JSON.stringify({ key, value: 'unsupported' }))
    expect(new ResearchCanvasStorage(directory).getItem(key)).toBeNull()
  })
  it('persists user table widths across client ports and rejects invalid column preferences', () => {
    const userData = temporaryUserData(), key = 'ework.research.table-columns.v1:board:node:0:schema'
    const state = JSON.stringify({ widths: [180, 120, 90], manual: [true, false, false] })
    const storage = new ResearchCanvasStorage(userData)
    expect(storage.setItem(key, state)).toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(key)).toBe(state)
    for (const value of ['{"widths":[20],"manual":[true]}', '{"widths":[120],"manual":[]}', '"wrong"', '{"widths":[120.5],"manual":[true]}']) expect(storage.setItem(key, value)).toBe(false)
    expect(storage.getItem(key)).toBe(state)
    expect(storage.setItem(key, 'null')).toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(key)).toBe('null')
  })
  it('survives a new reader such as a Harness restart on a different port', () => {
    const userData = temporaryUserData()
    const key = 'sherlock.research.canvas.files.v1:session-1'
    const value = '[{"id":"file-1"}]'

    expect(new ResearchCanvasStorage(userData).getItem(key)).toBeNull()
    expect(new ResearchCanvasStorage(userData).setItem(key, value)).toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(key)).toBe(value)
  })

  it('persists the durable Research-session engagement marker', () => {
    const userData = temporaryUserData()
    const key = 'sherlock.research.session-engaged.v1:session-research'

    expect(new ResearchCanvasStorage(userData).setItem(key, '1')).toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(key)).toBe('1')
  })

  it('persists independent board styles across a desktop restart', () => {
    const userData = temporaryUserData()
    const first = new ResearchCanvasStorage(userData)
    const lightKey = 'ework.research.presentation.v1:light-board'
    const enterpriseKey = 'ework.research.presentation.v1:enterprise-board'
    const light = JSON.stringify({ version: 1, mode: 'light' })
    const enterprise = JSON.stringify({ version: 1, mode: 'enterprise' })
    expect(first.setItem(lightKey, light)).toBe(true)
    expect(first.setItem(enterpriseKey, enterprise)).toBe(true)

    const restarted = new ResearchCanvasStorage(userData)
    expect(restarted.getItem(lightKey)).toBe(light)
    expect(restarted.getItem(enterpriseKey)).toBe(enterprise)
    expect(restarted.setItem(lightKey, JSON.stringify({ version: 1, mode: 'dark' })))
      .toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(enterpriseKey)).toBe(enterprise)
  })

  it('rejects invalid board styles without replacing the saved preference', () => {
    const storage = new ResearchCanvasStorage(temporaryUserData())
    const key = 'ework.research.presentation.v1:bounded-board'
    const valid = JSON.stringify({ version: 1, mode: 'dark' })
    expect(storage.setItem(key, valid)).toBe(true)
    for (const value of [
      'not json', 'null', '[]', 'x'.repeat(129),
      JSON.stringify({ version: 2, mode: 'light' }),
      JSON.stringify({ version: 1, mode: 'unknown' }),
      JSON.stringify({ version: 1, mode: 'light', theme: 'dark' })
    ]) {
      expect(storage.setItem(key, value)).toBe(false)
      expect(storage.getItem(key)).toBe(valid)
    }
  })

  it('persists the global Bloomberg trial across restarts without rewriting each board style', () => {
    const userData = temporaryUserData(), key = 'ework.research.openterminal-trial.v1'
    const original = new ResearchCanvasStorage(userData), boardKey = 'ework.research.presentation.v1:trial-board'
    const dark = JSON.stringify({ version: 1, mode: 'dark' })
    expect(original.setItem(boardKey, dark)).toBe(true)
    expect(original.setItem(key, 'enabled')).toBe(true)
    const restarted = new ResearchCanvasStorage(userData)
    expect(restarted.getItem(key)).toBe('enabled'); expect(restarted.getItem(boardKey)).toBe(dark)
    for (const value of ['true', 'false', '', 'enabled-extra', '{}']) expect(restarted.setItem(key, value)).toBe(false)
    expect(restarted.setItem(key + ':other', 'enabled')).toBe(false)
    expect(restarted.getItem(key)).toBe('enabled')
    expect(restarted.setItem(key, 'disabled')).toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(key)).toBe('disabled')
  })

  it('persists the bounded canvas viewport across a desktop storage restart', () => {
    const userData = temporaryUserData()
    const key = 'sherlock.research.canvas.viewport.v1:fund-board'
    const value = JSON.stringify({ x: 96, y: 100, scale: 0.85 })
    expect(new ResearchCanvasStorage(userData).setItem(key, value)).toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(key)).toBe(value)
    expect(new ResearchCanvasStorage(userData).setItem(key, 'x'.repeat(257))).toBe(false)
  })

  it('persists the preview revocation outbox through production IPC and a storage restart', () => {
    const userData = temporaryUserData()
    const key = 'sherlock.research.canvas.preview-revocations.v1:session-restart'
    const value = '["orphan-node"]'
    const webContents = { mainFrame: { processId: 7, routingId: 41 } }
    const window = { isDestroyed: () => false, webContents }
    const event = () => ({
      sender: webContents,
      senderFrame: { processId: 7, routingId: 41 },
      returnValue: undefined as unknown
    })
    const register = (storage: ResearchCanvasStorage) => {
      const handlers = new Map<string, (value: ReturnType<typeof event>, ...args: unknown[]) => void>()
      registerPrivilegedMainWindowHandlers({
        ipcMain: {
          removeHandler() {},
          removeAllListeners() {},
          handle() {},
          on(channel, handler) { handlers.set(channel, handler) }
        },
        getMainWindow: () => window,
        showHarnessLog() {},
        async openDirectory() { return null },
        showItemInFolder() { return { ok: false } },
        async researchFilesAvailable() { return [] },
        researchCanvasStorageGet: (storageKey) => storage.getItem(storageKey),
        researchCanvasStorageSet: (storageKey, storageValue) =>
          storage.setItem(storageKey, storageValue)
      })
      return handlers
    }

    const firstHandlers = register(new ResearchCanvasStorage(userData))
    const setEvent = event()
    firstHandlers.get('research:canvas-storage:set')?.(setEvent, key, value)
    expect(setEvent.returnValue).toBe(true)

    const restartedHandlers = register(new ResearchCanvasStorage(userData))
    const getEvent = event()
    restartedHandlers.get('research:canvas-storage:get')?.(getEvent, key)
    expect(getEvent.returnValue).toBe(value)
  })

  it('keeps only bounded Research-owned keys and values', () => {
    const userData = temporaryUserData()
    const storage = new ResearchCanvasStorage(userData)
    const validKey = 'sherlock.research.canvas.selection.v1:session-2'

    expect(storage.setItem('unrelated:key', '{}')).toBe(false)
    expect(storage.setItem(validKey, 'x'.repeat(RESEARCH_CANVAS_STORAGE_MAX_VALUE_LENGTH + 1)))
      .toBe(false)
    expect(storage.getItem('unrelated:key')).toBeNull()
    expect(storage.getItem(validKey)).toBeNull()
  })

  it('accepts the aggregate artifact capacity without allowing unbounded values', () => {
    const userData = temporaryUserData()
    const storage = new ResearchCanvasStorage(userData)
    const key = 'sherlock.research.canvas.artifacts.v1:capacity'
    const value = 'x'.repeat(RESEARCH_CANVAS_STORAGE_MAX_VALUE_LENGTH)

    expect(storage.setItem(key, value)).toBe(true)
    expect(new ResearchCanvasStorage(userData).getItem(key)).toBe(value)
    expect(storage.setItem(key, `${value}x`)).toBe(false)
  })

  it('ignores malformed persisted state without exposing arbitrary values', () => {
    const userData = temporaryUserData()
    const key = 'sherlock.research.canvas.artifacts.v1:session-3'
    const filePath = researchCanvasStoragePath(userData, key)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify({ key: 'unrelated:key', value: 'private' }))

    const storage = new ResearchCanvasStorage(userData)
    expect(storage.getItem('unrelated:key')).toBeNull()
    expect(storage.getItem(key)).toBeNull()
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      key: 'unrelated:key', value: 'private'
    })
  })
})
