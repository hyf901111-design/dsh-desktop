function HostedQuotaNotice({ session }) {
  const windows = { AI_QUOTA_FIVE_HOUR: 'fiveHour', AI_QUOTA_WEEK: 'week', AI_QUOTA_MONTH: 'month' }
  let blocked
  if (session?.sessionId && !session.running && session.chat) {
    const { order, nodes } = session.chat
    for (let index = order.length - 1; index >= 0; index--) {
      const node = nodes.get(order[index])
      if (!node || node.visibility === 'hidden') continue
      if (node.kind === 'user' || node.kind === 'steering') break
      if (node.kind === 'turn-error') {
        const code = node.data?.code
        if (Object.hasOwn(windows, code)) blocked = { window: windows[code], key: `${session.sessionId}:${node.key}` }
        break
      }
    }
  }
  const [dismissed, dismiss] = react.useState(null)
  const [state, setState] = react.useState(null)
  const key = blocked?.key !== dismissed ? blocked?.key : undefined
  react.useEffect(() => {
    if (!key) return
    const update = event => setState({ key, accountId: event.detail?.accountId, quota: event.detail?.quota })
    const refresh = () => window.dispatchEvent(new Event('sherlock:ai-quota-request'))
    window.addEventListener('sherlock:ai-quota-state', update)
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => {
      window.removeEventListener('sherlock:ai-quota-state', update)
      window.clearInterval(timer)
    }
  }, [key])
  if (!key || !document.documentElement.hasAttribute('data-odyssey-hosted-account') ||
      (state?.key === key && !state.accountId)) return null
  const en = document.documentElement.dataset.odysseyLocale === 'en'
  const copy = (zh, english) => en ? english : zh
  const windowKind = blocked.window
  const quota = state?.key === key ? state.quota : undefined
  const balance = quota?.[windowKind]
  const label = {
    fiveHour: copy('5 小时额度', '5-hour quota'),
    week: copy('本周额度', 'Weekly quota'),
    month: copy('本月额度', 'Monthly quota')
  }[windowKind]
  const title = label + (balance?.remaining === 0 ? copy('已用完', ' exhausted') : copy('不足以开始本次调用', ' is too low for this request'))
  const resetAt = windowKind === 'month' ? quota?.monthResetAt : balance?.resetAt
  let detail
  if (Number.isSafeInteger(resetAt) && resetAt * 1000 > Date.now()) {
    const date = new Date(resetAt * 1000)
    const time = date.toLocaleString(en ? 'en' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    detail = copy(`额度将于 ${time} 重置。`, `Quota resets on ${time}.`)
  } else if (Number.isSafeInteger(resetAt)) {
    detail = copy('原额度窗口已结束，可以重新发起请求。', 'The previous quota window has ended. You can try again.')
  } else {
    detail = copy('请在管理用量查看最新额度。', 'Check Usage for the latest balance.')
  }
  if (balance?.reserved > 0) detail += copy(' 在途请求结算后，可用量可能提前回升。', ' Available quota may recover sooner as pending requests settle.')
  return react_jsx_runtime.jsxs('div', {
    className: 'odyssey-hosted-quota-notice',
    children: [
      react_jsx_runtime.jsxs('div', { role: 'status', children: [
        react_jsx_runtime.jsx('strong', { children: title }),
        react_jsx_runtime.jsx('p', { children: detail })
      ] }),
      react_jsx_runtime.jsx('button', {
        type: 'button',
        onClick: () => window.dispatchEvent(new CustomEvent('sherlock:explore-open', { detail: { tab: 'usage' } })),
        children: copy('查看用量', 'View usage')
      }),
      react_jsx_runtime.jsx('button', { type: 'button', 'aria-label': copy('关闭额度提示', 'Dismiss quota notice'),
        onClick: () => dismiss(key), children: '×' })
    ]
  })
}

export function patchHostedQuotaNotice(source) {
  const marker = '/* odyssey-hosted-quota-notice:v1 */'
  if (source.includes(marker)) return source
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Hosted quota notice anchor drifted')
    source = source.replace(before, () => after)
  }
  const composer = 'function ComposerSurface('
  replace(composer, marker + '\n' + HostedQuotaNotice.toString() + '\n' + composer)
  const dock = 'zone !== void 0 && renderSlot("conversation.input.dock", zone),'
  replace(dock, dock + '\n\t\t\t\t\t!hero && (0, react_jsx_runtime.jsx)(HostedQuotaNotice, { session }),')
  const errorCode = 'node.code !== void 0 && (0, react_jsx_runtime.jsx)("code", {\n\t\t\t\t\t\tclassName: MessageItem_module_css_default.turnErrorCode,'
  replace(errorCode, errorCode.replace('node.code !== void 0', 'node.code !== void 0 && !/^AI_QUOTA_(FIVE_HOUR|WEEK|MONTH)$/.test(node.code)'))
  return source
}
