// Before the scheduler sent execution guidance privately, both the instructions and
// change marker were stored as chat content. Project those historical turns on read.
const legacySuffix = '\n\n这是定时任务的一次执行，请现在执行本次内容，不要再创建定时任务。与本对话上次结果比较。若没有值得提醒的新内容，在最终回复末尾单独写 [NO_CHANGE]；有重要变化则写 [CHANGED]。'

function legacyScheduledUser(event) {
  const data = event.data
  return event.type === 'user/message' && data?.source?.kind === 'user' &&
    typeof data.source.rpcId === 'string' && data.content?.length === 1 &&
    data.content[0].type === 'text' && data.content[0].text.endsWith(legacySuffix)
}

export function scheduledHistoryEntries(entries) {
  let scheduled = false
  return entries.map(entry => {
    const {event} = entry
    if (event.type === 'turn/end') scheduled = false
    if (event.type === 'user/message' && event.data?.source?.kind === 'user') {
      scheduled = legacyScheduledUser(event)
      if (scheduled) {
        const part = event.data.content[0]
        return {...entry, event: {...event, data: {...event.data,
          content: [{...part, text: part.text.slice(0, -legacySuffix.length)}]}}}
      }
    }
    if (!scheduled || event.type !== 'assistant/message') return entry
    const message = event.data.message
    const last = message?.content?.findLastIndex(part => part.type === 'text')
    if (!(last >= 0)) return entry
    const part = message.content[last]
    const match = /(?:^|\n)\s*\[(NO_CHANGE|CHANGED)\]\s*$/u.exec(part.text)
    if (!match) return entry
    const text = part.text.slice(0, match.index).trimEnd() || (match[1] === 'NO_CHANGE' ? '本次无新变化。' : '本次有更新。')
    const content = message.content.with(last, {...part, text})
    return {...entry, event: {...event, data: {...event.data, message: {...message, content}}}}
  })
}

export function patchScheduledTaskHistory(source) {
  const marker = '/* ework:scheduled-run-history:v1 */'
  if (source.includes(marker)) return source
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Scheduled history anchor drifted: ' + before)
    source = source.replace(before, () => after)
  }
  const anchor = 'function conversationInput(entry) {'
  replace(anchor, [marker, 'const legacySuffix = '+ JSON.stringify(legacySuffix) + ';', legacyScheduledUser, scheduledHistoryEntries, anchor].join('\n'))
  const sorted = 'const sorted = [...entries].sort((left, right) => left.event.seq - right.event.seq);'
  replace(sorted, 'const sorted = scheduledHistoryEntries([...entries].sort((left, right) => left.event.seq - right.event.seq));')
  const prepend = 'prepend(entries, hasMore) {'
  replace(prepend, prepend + '\nif (entries.some(entry => legacyScheduledUser(entry.event))) return this.replaceWindow([...entries, ...this.sortedInputs()], hasMore);')
  return source
}
