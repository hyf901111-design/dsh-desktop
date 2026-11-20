/**
 * The native composer and session.prompt both check the current session model
 * before an Agent request reaches the replay adapter.
 */
export function presentHomeGuideReplayRoute(ctx, run, provider, maxTokens) {
  const session = run.agent.session
  const previous = session.requestHeader()
  session.append('request/header', {
    header: { ...previous, config: { provider, model: 'v1', maxTokens } },
    reason: previous ? 'change' : 'initial'
  })
  notifyModelDirectory(ctx)
}

export function notifyModelDirectory(ctx) {
  ctx.llm.emitAdaptersUpdated?.()
}
