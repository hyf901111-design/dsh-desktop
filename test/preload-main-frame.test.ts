import { Window } from 'happy-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronFakes = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async () => ({
    phase: 'idle',
    currentVersion: '0.7.3',
    manual: false
  })),
  on: vi.fn(),
  removeListener: vi.fn(),
  sendSync: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronFakes.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronFakes.invoke,
    on: electronFakes.on,
    removeListener: electronFakes.removeListener,
    sendSync: electronFakes.sendSync
  },
  webUtils: { getPathForFile: () => '/tmp/preview.html' }
}))

const originalIsMainFrame = Object.getOwnPropertyDescriptor(process, 'isMainFrame')
let browserWindow: Window

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  browserWindow = new Window({ url: 'http://127.0.0.1:4310/' })
  browserWindow.document.body.innerHTML = '<footer data-dsh-sidebar-footer></footer>'
  vi.stubGlobal('window', browserWindow)
  vi.stubGlobal('document', browserWindow.document)
  vi.stubGlobal('navigator', browserWindow.navigator)
  vi.stubGlobal('MutationObserver', browserWindow.MutationObserver)
  vi.stubGlobal('File', browserWindow.File)
  Object.defineProperty(process, 'isMainFrame', {
    configurable: true,
    value: false
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalIsMainFrame) {
    Object.defineProperty(process, 'isMainFrame', originalIsMainFrame)
  } else {
    Reflect.deleteProperty(process, 'isMainFrame')
  }
})

describe('preload frame boundary', () => {
  it('exposes only a frozen main-frame clipboard bridge with opaque asset requests', async () => {
    Object.defineProperty(process, 'isMainFrame', { configurable: true, value: true })
    await import('../src/preload/index')
    const desktop = electronFakes.exposeInMainWorld.mock.calls.find(([name]) => name === 'dshDesktop')?.[1]
    expect(Object.isFrozen(desktop.researchClipboard)).toBe(true)
    expect(Object.keys(desktop.researchClipboard)).toEqual(['inspect', 'copy', 'read', 'admit', 'open'])
    await desktop.researchClipboard.admit({ assetId: 'opaque', sessionId: 'target', nodeId: 'new' })
    expect(electronFakes.invoke).toHaveBeenCalledWith('research:clipboard:admit', { assetId: 'opaque', sessionId: 'target', nodeId: 'new' })
  })
  it('exposes only capture identity, never the private context transport', async () => {
    Object.defineProperty(process, 'isMainFrame', { configurable: true, value: true })
    await import('../src/preload/index')
    const desktop = electronFakes.exposeInMainWorld.mock.calls.find(([name]) => name === 'dshDesktop')?.[1]
    expect(Object.isFrozen(desktop.researchContext)).toBe(true)
    expect(Object.keys(desktop.researchContext)).toEqual(['capture'])
    await desktop.researchContext.capture({ sessionId: 'parent' })
    expect(electronFakes.invoke).toHaveBeenCalledWith('research:context:capture', { sessionId: 'parent' })
    expect(desktop.researchContext.token).toBeUndefined()
    expect(desktop.researchContext.url).toBeUndefined()
  })
  it('does not expose application bridges or mount application UI in a child frame', async () => {
    await import('../src/preload/index')
    browserWindow.document.dispatchEvent(new browserWindow.Event('DOMContentLoaded'))
    await Promise.resolve()

    expect(electronFakes.exposeInMainWorld).not.toHaveBeenCalled()
    expect(electronFakes.on).not.toHaveBeenCalled()
    expect(electronFakes.invoke).not.toHaveBeenCalled()
    expect(electronFakes.sendSync).not.toHaveBeenCalled()
    expect(browserWindow.document.querySelector('#sherlock-sidebar-update-button')).toBeNull()
    expect(browserWindow.document.querySelector('#sherlock-developer-mode-style')).toBeNull()
  })

  it('exposes the frozen research canvas wheel bridge only in the trusted main frame', async () => {
    Object.defineProperty(process, 'isMainFrame', {
      configurable: true,
      value: true
    })
    electronFakes.sendSync.mockReturnValue(true)
    await import('../src/preload/index')

    const desktopExposure = electronFakes.exposeInMainWorld.mock.calls.find(
      ([name]) => name === 'dshDesktop'
    )
    expect(desktopExposure).toBeDefined()
    const desktop = desktopExposure?.[1] as {
      researchCanvasWheel: {
        setRegion(value: unknown): boolean
        subscribe(listener: (value: unknown) => void): () => void
        subscribeCommandState(listener: (active: boolean) => void): () => void
      }
    }
    expect(Object.isFrozen(desktop)).toBe(true)
    expect(Object.isFrozen(desktop.researchCanvasWheel)).toBe(true)
    const update = {
      active: true, generation: 1, ownerId: 'canvas-1',
      left: 10, top: 20, width: 500, height: 400
    }
    expect(desktop.researchCanvasWheel.setRegion(update)).toBe(true)
    expect(electronFakes.sendSync).toHaveBeenCalledWith(
      'research:canvas-wheel:set-region',
      update
    )
    const unsubscribe = desktop.researchCanvasWheel.subscribe(vi.fn())
    expect(electronFakes.on).toHaveBeenCalledWith(
      'research:canvas-wheel:native',
      expect.any(Function)
    )
    unsubscribe()
    expect(electronFakes.removeListener).toHaveBeenCalledWith(
      'research:canvas-wheel:native',
      expect.any(Function)
    )
    const unsubscribeCommand = desktop.researchCanvasWheel.subscribeCommandState(vi.fn())
    expect(electronFakes.on).toHaveBeenCalledWith(
      'research:canvas-wheel:command-state',
      expect.any(Function)
    )
    unsubscribeCommand()
    expect(electronFakes.removeListener).toHaveBeenCalledWith(
      'research:canvas-wheel:command-state',
      expect.any(Function)
    )
  })
})
