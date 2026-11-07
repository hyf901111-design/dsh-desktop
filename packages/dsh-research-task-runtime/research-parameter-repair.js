// A late, successful definition read can otherwise consume the entire source
// phase. Permit one next network attempt, only after an observed parameter
// error and a matching catalog response. This never adds tools or read slots.
export function researchParameterRepair(networkTools, discoveryTools) {
  const calls = new Map()
  let failed, ready = false, granted = false, consumed = false
  return {
    accept(event) {
      if (consumed) return
      if (event?.type === 'tool/call' && networkTools.has(event.data?.name)) {
        if (granted) { consumed = true; return }
        // A read after the definition is already its retry opportunity.
        ready = false
        try {
          const args = typeof event.data.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data.arguments
          if (typeof event.data.callId === 'string' && typeof args?.api_name === 'string')
            calls.set(event.data.callId, {tool: event.data.name, api: args.api_name})
          while (calls.size > 64) calls.delete(calls.keys().next().value)
        } catch {}
        return
      }
      if (event?.type !== 'tool/result') return
      const message = event.data?.message, call = calls.get(message?.source?.callId)
      if (!call) return
      calls.delete(message.source.callId)
      const block = message.content?.find(item => item.type === 'tool-result')
      if (!block) return
      const text = (block.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n')
      if (!discoveryTools.has(call.tool)) {
        if ((block.isError || block.error) && /参数或字段无效|Unknown field|Invalid parameter/iu.test(text) && !/权限|频率|permission|rate.limit/iu.test(text))
          failed = call
        else if (failed?.tool === call.tool && failed.api === call.api) { failed = undefined; ready = false }
        return
      }
      if (!failed || failed.api !== call.api || block.isError || block.error) return
      try {
        const definition = JSON.parse(text)
        ready = definition.kind === 'catalog' && definition.interfaces?.some(api =>
          api.api === failed.api && api.parameters && api.fields && Object.keys(api.fields).length > 0) === true
      } catch {}
    },
    allowAfterDeadline(elapsed) {
      if (!failed || !ready || consumed || elapsed >= 135000) return false
      granted = true
      return true
    }
  }
}
