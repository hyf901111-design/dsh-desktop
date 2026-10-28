import type { ResearchVoiceApi, ResearchVoiceEvent, ResearchVoiceResult } from '../shared/research-voice'

type ResearchVoiceIpcRenderer = {
  invoke(channel: string, value: unknown): Promise<unknown>
  on(channel: string, listener: (event: unknown, value: ResearchVoiceEvent) => void): unknown
  removeListener(channel: string, listener: (event: unknown, value: ResearchVoiceEvent) => void): unknown
}

export function createResearchVoiceBridge(ipcRenderer: ResearchVoiceIpcRenderer): ResearchVoiceApi {
  return Object.freeze({
    setActive: (value) => ipcRenderer.invoke('research:voice:set-active', value) as Promise<ResearchVoiceResult>,
    start: (value) => ipcRenderer.invoke('research:voice:start', value) as Promise<ResearchVoiceResult>,
    startComposer: (value) => ipcRenderer.invoke('research:voice:start-composer', value) as Promise<ResearchVoiceResult>,
    stop: (value) => ipcRenderer.invoke('research:voice:stop', value) as Promise<ResearchVoiceResult>,
    cancel: (value) => ipcRenderer.invoke('research:voice:cancel', value) as Promise<ResearchVoiceResult>,
    subscribe(listener) {
      const receive = (_event: unknown, value: ResearchVoiceEvent) => listener(value)
      ipcRenderer.on('research:voice:event', receive)
      return () => { ipcRenderer.removeListener('research:voice:event', receive) }
    }
  } satisfies ResearchVoiceApi)
}
