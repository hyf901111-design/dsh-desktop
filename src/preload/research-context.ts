export function createResearchContextBridge(invoke: (channel: string, value: unknown) => Promise<unknown>) {
  return Object.freeze({
    capture(value: { sessionId: string }) {
      return invoke('research:context:capture', value) as Promise<{ captureId: string; totalSources: number }>
    }
  })
}
