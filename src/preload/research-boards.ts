import type {
  BoardsResult,
  ResearchBoardsBridge,
  ResearchBoardsEvent,
  ResearchBoardsState
} from '../shared/research-boards'
type Ipc = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  sendSync(channel: string, ...args: unknown[]): unknown
  on(
    channel: string,
    listener: (event: unknown, value: ResearchBoardsEvent) => void
  ): unknown
  removeListener(
    channel: string,
    listener: (event: unknown, value: ResearchBoardsEvent) => void
  ): unknown
}
export function createResearchBoardsBridge(ipc: Ipc): ResearchBoardsBridge {
  return Object.freeze({
    isSharedSession: (sessionId: string) =>
      ipc.sendSync('research:boards:is-shared-session', sessionId) === true,
    getSnapshot: () =>
      ipc.invoke('research:boards:snapshot') as Promise<ResearchBoardsState>,
    invoke: (action: string, input: unknown = {}) =>
      ipc.invoke(
        'research:boards:invoke',
        action,
        input
      ) as Promise<BoardsResult>,
    subscribe: (listener: (event: ResearchBoardsEvent) => void) => {
      const proxy = (_event: unknown, event: ResearchBoardsEvent) =>
        listener(event)
      ipc.on('research:boards:event', proxy)
      return () => {
        ipc.removeListener('research:boards:event', proxy)
      }
    }
  })
}
