export type ResearchVoiceResult = { ok: boolean; error?: string }
export type ResearchVoiceActiveRequest = { sessionId: string; active: boolean }
export type ResearchVoiceRequest = { sessionId: string; requestId: string }
export type ResearchVoiceState = 'authorizing' | 'listening' | 'transcribing'

type ResearchVoiceCaptureEvent =
  | { type: 'state'; state: ResearchVoiceState }
  | { type: 'partial'; text: string }
  | { type: 'level'; level: number }
  | { type: 'final'; text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'cancelled' }

export type ResearchVoiceNativeEvent =
  | { type: 'toggle' }
  | { type: 'hold-start' }
  | { type: 'finish' }
  | (ResearchVoiceCaptureEvent & { requestId: string })

export type ResearchVoiceEvent =
  | { type: 'toggle'; sessionId: string }
  | { type: 'hold-start'; sessionId: string }
  | { type: 'finish'; sessionId: string }
  | (ResearchVoiceCaptureEvent & ResearchVoiceRequest)

export type ResearchVoiceApi = {
  setActive(value: ResearchVoiceActiveRequest): Promise<ResearchVoiceResult>
  start(value: ResearchVoiceRequest): Promise<ResearchVoiceResult>
  startComposer(value: ResearchVoiceRequest): Promise<ResearchVoiceResult>
  stop(value: ResearchVoiceRequest): Promise<ResearchVoiceResult>
  cancel(value: ResearchVoiceRequest): Promise<ResearchVoiceResult>
  subscribe(listener: (event: ResearchVoiceEvent) => void): () => void
}
