function TurnErrorItem({ node }) {
  const en = document.documentElement.dataset.odysseyLocale === 'en'
  const copy = (zh, english) => en ? english : zh
  let message
  switch (node.code) {
    case 'AI_QUOTA_FIVE_HOUR':
      message = copy('当前 5 小时可用额度不足，这轮任务暂停了。恢复时间可在输入框上方查看。', 'This turn stopped because there was not enough 5-hour quota. The reset time is shown above the input.')
      break
    case 'AI_QUOTA_WEEK':
      message = copy('本周可用额度不足，这轮任务暂停了。恢复时间可在输入框上方查看。', 'This turn stopped because there was not enough weekly quota. The reset time is shown above the input.')
      break
    case 'AI_QUOTA_MONTH':
      message = copy('本月可用额度不足，这轮任务暂停了。恢复时间可在输入框上方查看。', 'This turn stopped because there was not enough monthly quota. The reset time is shown above the input.')
      break
    case 'QUOTA':
    case 'RATE_LIMIT':
      message = copy('模型暂时无法接收新的请求，请稍后再试。', 'The model cannot take another request right now. Please try again later.')
      break
    case 'SERVER':
    case 'HOSTED_AI_UPSTREAM':
      message = copy('模型服务暂时出错，任务在这里中断了。', 'The model service encountered an error and interrupted the task.')
      break
    case 'HOSTED_AI_DUPLICATE':
      message = copy('模型服务已经受理了这次请求，但客户端未收到完整结果。', 'The model service accepted the request, but the client did not receive a complete result.')
      break
    case 'TIMEOUT':
      message = copy('等待模型响应超时，任务在这里中断了。', 'The task was interrupted while waiting for the model to respond.')
      break
    case 'TRANSPORT':
    case 'HOSTED_AI_STREAM_INTERRUPTED':
      message = copy('模型连接中断了，已经生成的内容仍在会话里。', 'The model connection was interrupted. Any content already generated is still in the conversation.')
      break
    case 'CONTEXT_WINDOW_EXCEEDED':
    case 'HOSTED_AI_PAYLOAD_TOO_LARGE':
      message = copy('这次发送的内容太多了。请缩短消息，或减少随消息发送的附件。', 'This request contained too much content. Try a shorter message or fewer attachments.')
      break
    case 'AUTH':
    case 'FORBIDDEN':
    case 'INVALID_CREDENTIAL':
    case 'MISSING_CREDENTIAL':
      message = copy('当前账号无法调用所选模型，请检查登录状态或模型配置。', 'The selected model is unavailable for this account. Check your sign-in status or model settings.')
      break
    default:
      message = copy('任务在执行中中断了，已生成的内容保存在本会话。', 'This turn did not finish. Any content already generated is still in the conversation.')
  }
  return react_jsx_runtime.jsx('p', { className: 'odyssey-conversation-failure', role: 'status', children: message })
}

function interruptedTurnKey(snapshot) {
  if (!snapshot?.sessionId || snapshot.sessionId.startsWith('knowledge-view:') ||
      snapshot.running || snapshot.queue?.length || snapshot.subagent || !snapshot.chat) return null
  if (typeof sherlockShared === 'function' && sherlockShared(snapshot.sessionId) &&
      sherlockBoardsAdapter?.getView(snapshot.sessionId)?.permissions.edit !== true) return null
  const { order, nodes } = snapshot.chat
  for (let index = order.length - 1; index >= 0; index--) {
    const node = nodes.get(order[index])
    if (!node || node.visibility === 'hidden') continue
    if (node.kind === 'turn-error') {
      // Authentication, quota and oversized input require a change before another turn.
      if (/^(?:AI_QUOTA_|QUOTA$|AUTH$|FORBIDDEN$|(?:INVALID|MISSING)_CREDENTIAL$|CONTEXT_WINDOW_EXCEEDED$|HOSTED_AI_PAYLOAD_TOO_LARGE$)/.test(node.data?.code ?? '')) return null
      return snapshot.sessionId + ':' + node.key
    }
    if (node.kind === 'user' || node.kind === 'steering') break
  }
  return null
}

function InterruptedTurnAction({ useSession, useInput, inputActions }) {
  const key = useSession(interruptedTurnKey)
  const input = useInput(state => state)
  const submitted = react.useRef(null)
  const busy = !input || input.phase !== 'plain' || input.draft !== '' || input.imageIds?.length ||
    input.occurrences?.length || input.queue?.length || input.paste
  react.useEffect(() => {
    if (!key || submitted.current?.key === key && !busy && submitted.current.revision !== input.draftRev) submitted.current = null
  }, [key, busy, input?.draftRev])
  if (!key || !inputActions?.setDraft || !inputActions?.submit) return null
  const en = document.documentElement.dataset.odysseyLocale === 'en'
  const resume = () => {
    if (busy || submitted.current?.key === key) return
    submitted.current = { key, revision: input.draftRev }
    try {
      inputActions.setDraft(en
        ? 'Continue from the interruption. Check the existing results and actions already taken, then finish the remaining work.'
        : '请从上次中断的地方继续。先核对已有结果和已执行的操作，再完成剩余工作。')
      inputActions.submit()
    } catch {
      submitted.current = null
    }
  }
  return react_jsx_runtime.jsx('button', { type: 'button', className: 'odyssey-interrupted-turn-action',
    disabled: !!busy, onClick: resume, children: en ? 'Continue task' : '继续任务' })
}

function ConversationTaskDock(props) {
  return react_jsx_runtime.jsxs(react.Fragment, { children: [
    react_jsx_runtime.jsx(TodoDock, props), react_jsx_runtime.jsx(InterruptedTurnAction, props)
  ] })
}

export function patchConversationFailureCopy(source) {
  const marker = '/* odyssey-conversation-failure-copy:v2 */'
  if (source.includes(marker)) return source
  const previous = source.indexOf('/* odyssey-conversation-failure-copy:v1 */')
  const start = previous >= 0 ? previous : source.indexOf('function TurnErrorItem({ node, t }) {')
  const end = source.indexOf('/** Persistent, turn-positioned notice for a turn ended at the output-token cap. */', start)
  if (start < 0 || end < start) throw Error('Conversation failure view boundary drifted')
  const views = [TurnErrorItem, interruptedTurnKey, InterruptedTurnAction, ConversationTaskDock]
  source = source.slice(0, start) + [marker, ...views.map(view => view.toString())].join('\n') + '\n\t\t' + source.slice(end)
  const dock = '}, TodoDock));'
  const failure = 'return chatNode(context, "turn-error", node.seq, node);'
  const hidden = 'if (!state.hidden) ' + failure + '\n\t\t\t\tconst current = context.current.get("chat");\n\t\t\t\treturn current === void 0 || current === null ? null : chatNode(context, "turn-error", node.seq, node, { visibility: "hidden" });'
  if (source.split(dock).length !== 2 || source.split(hidden).length !== 2) throw Error('Conversation terminal recovery anchor drifted')
  // Only a recorded turn/end error reaches this projection. A previous llm/retry is not a resolution.
  return source.replace(dock, '}, ConversationTaskDock));').replace(hidden, failure)
}
