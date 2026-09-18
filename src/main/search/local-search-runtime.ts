import type { BrowserWindowConstructorOptions } from 'electron'
import {
  BrowserSearchController,
  type BrowserSearchWindow
} from './browser-search-controller'
import {
  LocalSearchBridge,
  type LocalSearchEndpoint
} from './local-search-bridge'

export interface LocalSearchRuntimeOptions {
  readPage?(url: string, signal: AbortSignal): Promise<unknown>
  browserUse?(input: unknown, signal: AbortSignal): Promise<unknown>
  createWindow(options: BrowserWindowConstructorOptions): BrowserSearchWindow
}

export interface LocalSearchRuntime {
  endpoint: LocalSearchEndpoint
  stop(): Promise<void>
}

export async function startLocalSearchRuntime(
  options: LocalSearchRuntimeOptions
): Promise<LocalSearchRuntime> {
  const browser = new BrowserSearchController({ createWindow: options.createWindow })
  const bridge = new LocalSearchBridge({
    search: (query, maxResults, signal) => browser.search(query, maxResults, signal),
    readPage: options.readPage,
    browserUse: options.browserUse
  })
  try {
    const endpoint = await bridge.start()
    let stopped = false
    return {
      endpoint,
      stop: async () => {
        if (stopped) return
        stopped = true
        await bridge.stop()
        browser.dispose()
      }
    }
  } catch (error) {
    await bridge.stop()
    browser.dispose()
    throw error
  }
}
