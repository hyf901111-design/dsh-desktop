// The correlation ID is preserved in the durable user event across dispatch, restart and replay.
export function scheduledRunId(id, notification) {
  return `scheduled-run:${notification === 'changes' ? 'compare' : 'execute'}:${id}`
}

export function scheduledRunMode(session) {
  const user = session?.events?.findLast(event => event.type === 'user/message' && event.data?.source?.kind === 'user')
  const match = /^scheduled-run:(compare|execute):[\da-f-]+$/i.exec(user?.data.source.rpcId ?? '')
  return match?.[1]
}

export const noScheduledChanges = '本次无新变化。'
export function scheduledResultUnchanged(output) {
  const lastLine = output.trimEnd().split(/\r?\n/).at(-1)?.trim()
  return lastLine === noScheduledChanges || lastLine === '[NO_CHANGE]'
}
