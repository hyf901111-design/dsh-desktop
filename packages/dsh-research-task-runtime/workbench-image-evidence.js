// Keep durable image references attached to the exact human request that
// created this plan. A later question or queued message must not replace it.
export function workbenchRequestImages(session, messageId) {
  if (!messageId) return []
  for (const event of session?.events ?? []) {
    const messages = event.type === 'user/message' ? [event.data]
      : event.type === 'agent/inbox/spliced' ? event.data?.inserted ?? [] : []
    const message = messages.find(value => value?.id === messageId && value.source?.kind === 'user')
    if (!message) continue
    return (message.content ?? []).filter(part => part.type === 'image').map(part => {
      if (typeof part.attachment?.attachmentId !== 'string' || !part.attachment.attachmentId) throw Error('本次原型图片暂不可读取，请重新发送原图。')
      return {type:'image',attachment:structuredClone(part.attachment)}
    })
  }
  throw Error('本次工作台的原始需求暂不可读取，请重新发送需求。')
}

export async function workbenchImageEvidence(ctx, parent, messageId, selection, signal) {
  const images = workbenchRequestImages(parent.session, messageId)
  if (!images.length) return images
  signal?.throwIfAborted()
  const chosen = selection ?? parent.options
  if (!chosen?.provider || !chosen?.model || typeof ctx.llm?.resolveModelInfo !== 'function') throw Error('无法核对当前组件模型的图片能力，请选择支持图片的模型后重试。')
  const info = await ctx.llm.resolveModelInfo(chosen.provider, chosen.model, signal)
  signal?.throwIfAborted()
  if (info?.inputModalities !== undefined && !info.inputModalities.includes('image')) throw Error('当前组件模型不支持图片，请切换支持图片的模型后重新生成；原需求和图片已保留。')
  if (typeof ctx.attachments?.readImage !== 'function') throw Error('本次原型图片读取服务不可用，原需求和图片已保留。')
  try {
    for (const image of images) {
      signal?.throwIfAborted()
      await ctx.attachments.readImage(image.attachment, signal)
    }
  } catch (error) {
    signal?.throwIfAborted()
    throw Error('本次原型图片暂不可读取，原需求和图片已保留。', {cause:error})
  }
  return images
}
