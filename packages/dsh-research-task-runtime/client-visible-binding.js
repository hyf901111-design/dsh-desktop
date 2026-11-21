export const NO_VISIBLE_CLIENT = '当前会话未绑定可见客户端，请回到该会话后重试。'
export const VISIBLE_MODE_CHANGED = '当前客户端视图已切换，请在目标应用重新发送请求。'
export const LOST_VIEW_GUIDANCE = '客户端宿主已确认本轮失去原可见页面。请依据本轮已返回的真实回执答复：区分已保存、已回读和尚未核实的事项。不要再次访问该视图，也不要要求用户重复已完成的操作。'

export function isVisibleCapabilityTool(name) {
  return name === 'client_action' || name === 'client_capabilities'
}

export function isLostViewResult(message, callId) {
  if (message?.source?.kind !== 'tool' || message.source.callId !== callId) return false
  return Array.isArray(message.content) && message.content.some(block => block.type === 'tool-result' && block.toolCallId === callId &&
    block.isError === true && Array.isArray(block.content) && block.content.length === 1 && block.content[0]?.type === 'text' &&
    [NO_VISIBLE_CLIENT,VISIBLE_MODE_CHANGED].some(reason => block.content[0].text === 'Error: ' + reason || block.content[0].text === reason))
}
