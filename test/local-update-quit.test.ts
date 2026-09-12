import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { finishQuitCleanup } from '../src/main/quit-cleanup'

// Execute the actual index.ts before-quit registration; do not bootstrap Electron/services.
const source = readFileSync('src/main/index.ts', 'utf8')
const start = source.indexOf("  app.on('before-quit', (event) => {")
const end = source.indexOf('\n  })', start)
if (start < 0 || end < 0) throw Error('Main before-quit registration boundary missing')
const registration = source.slice(start, end + '\n  })'.length)
function setup(stopUpdateManager: () => Promise<void>, withRuntime = true) {
  let handler!: (event: {preventDefault(): void}) => void
  const app = {on: (_event: string, callback: typeof handler) => { handler = callback }, quit: vi.fn()}
  const warn = vi.fn(), noop = () => {}
  new Function('app','finishQuitCleanup','stopUpdateManager','runtime','localSearchRuntime','researchContextBridge',
    'disposeResearchBoardsHandlers','researchBoardsService','accountService','researchVoiceController','stopHarnessThemePreferenceSync','disposeResearchContextHandlers','console',
    'let quitting = false;\n' + registration
  )(app,finishQuitCleanup,stopUpdateManager,withRuntime?{stop:async()=>{}}:undefined,undefined,undefined,noop,undefined,undefined,{dispose:noop},noop,noop,{warn})
  return {app,handler,warn}
}
afterEach(()=>vi.useRealTimers())
it.each([true,false])('waits for update cancellation/cache cleanup in the real main handler (runtime=%s)',async(withRuntime)=>{
  vi.useFakeTimers()
  let done!:()=>void
  const stop=vi.fn(()=>new Promise<void>(resolve=>{done=resolve}))
  const {app,handler}=setup(stop,withRuntime),event={preventDefault:vi.fn()}
  handler(event);await vi.advanceTimersByTimeAsync(0)
  expect(event.preventDefault).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalledOnce();expect(app.quit).not.toHaveBeenCalled()
  done();await vi.advanceTimersByTimeAsync(0);expect(app.quit).toHaveBeenCalledOnce()
  handler(event);await vi.advanceTimersByTimeAsync(0);expect(stop).toHaveBeenCalledOnce()
})
it('bounds a stuck update cleanup by the existing 15 second main quit deadline',async()=>{
  vi.useFakeTimers()
  const {app,handler,warn}=setup(()=>new Promise(()=>{}))
  handler({preventDefault:vi.fn()});await vi.advanceTimersByTimeAsync(14_999);expect(app.quit).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1);expect(app.quit).toHaveBeenCalledOnce();expect(warn).toHaveBeenCalledWith('[shutdown]',expect.stringContaining('timed out'))
})
