import type { BrowserWindowConstructorOptions } from 'electron'
import {
  BrowserSearchController,
  type BrowserSearchWindow
} from './browser-search-controller'
import {
  LocalSearchBridge,
  type LocalSearchEndpoint,
  type LocalSearchBridgeOptions
} from './local-search-bridge'

export interface LocalSearchRuntimeOptions {
  readPage?(url: string, signal: AbortSignal): Promise<unknown>
  computerUse?(input: unknown, signal: AbortSignal): Promise<unknown>
  browserUse?(input: unknown, signal: AbortSignal): Promise<unknown>
  search?: LocalSearchBridgeOptions['search']
  searchHosted?: LocalSearchBridgeOptions['searchHosted']
  createWindow(options: BrowserWindowConstructorOptions): BrowserSearchWindow
}

export interface LocalSearchRuntime {
  endpoint: LocalSearchEndpoint
  stop(): Promise<void>
}

export async function startLocalSearchRuntime(
  options: LocalSearchRuntimeOptions
): Promise<LocalSearchRuntime> {
  const browser = options.search ? undefined : new BrowserSearchController({ createWindow: options.createWindow })
  const bridge = new LocalSearchBridge({
    search: options.search ?? ((query, maxResults, signal) => browser!.search(query, maxResults, signal)),
    searchHosted: options.searchHosted,
    readPage: options.readPage,
    computerUse: options.computerUse,
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
        await browser?.dispose()
      }
    }
  } catch (error) {
    await bridge.stop()
    await browser?.dispose()
    throw error
  }
}
