/** Keep the default reply state simple; real Tool/command activity retains its own label. */
export function patchConversationThinkingStatus(source) {
  for (const [key, before, after] of [
    ['execution.status.analyzing', '正在分析任务…', '正在思考'],
    ['execution.status.context', '正在准备任务上下文…', '正在思考'],
    ['execution.status.analyzing', 'Analyzing the task…', 'Thinking'],
    ['execution.status.context', 'Preparing task context…', 'Thinking']
  ]) {
    const oldEntry = JSON.stringify(key) + ': ' + JSON.stringify(before)
    const newEntry = JSON.stringify(key) + ': ' + JSON.stringify(after)
    if (source.includes(newEntry)) continue
    if (source.split(oldEntry).length !== 2) throw Error('Conversation thinking label drifted: ' + key)
    source = source.replace(oldEntry, newEntry)
  }
  return source
}
