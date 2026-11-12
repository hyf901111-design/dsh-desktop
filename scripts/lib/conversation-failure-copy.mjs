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
    case 'TRANSPORT':
    case 'TIMEOUT':
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
      message = copy('这轮任务没有顺利完成。已经生成的内容仍在会话里。', 'This turn did not finish. Any content already generated is still in the conversation.')
  }
  return react_jsx_runtime.jsx('p', { className: 'odyssey-conversation-failure', role: 'status', children: message })
}

export function patchConversationFailureCopy(source) {
  const marker = '/* odyssey-conversation-failure-copy:v1 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('function TurnErrorItem({ node, t }) {')
  const end = source.indexOf('/** Persistent, turn-positioned notice for a turn ended at the output-token cap. */', start)
  if (start < 0 || end < start) throw Error('Conversation failure view boundary drifted')
  return source.slice(0, start) + marker + '\n' + TurnErrorItem.toString() + '\n\t\t' + source.slice(end)
}
