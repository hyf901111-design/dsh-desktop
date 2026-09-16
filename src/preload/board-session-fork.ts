type ForkInput = { sessionId: string; atSeq?: number; increaseTitle?: boolean }
type Sessions = { fork(input: ForkInput): Promise<string> }

/** Register the board's real project before the Host copies its membership. */
export function installBoardSessionFork(
  sessions: Sessions,
  isBoard: (id: string) => boolean,
  prepare: (id: string) => Promise<unknown>,
  refresh: () => Promise<unknown>
): () => void {
  const original = sessions.fork
  const fork = async (input: ForkInput) => {
    if (!isBoard(input.sessionId)) return original.call(sessions, input)
    await prepare(input.sessionId)
    const child = await original.call(sessions, input)
    await refresh()
    return child
  }
  sessions.fork = fork
  return () => { if (sessions.fork === fork) sessions.fork = original }
}
