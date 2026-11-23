const marker = '/* sherlock:hosted-chat-completion-tail:v1 */'

function completedHostedResponse(model, options, response, error, finalReason, output) {
  if (model.provider !== 'ework-ark' || options?.signal?.aborted || !finalReason) return false
  const id = options?.headers?.['x-ework-request-id']
  if (!id || response.headers.get('x-ework-request-id') !== id) return false
  const interrupted = error?.code === 'HOSTED_AI_STREAM_INTERRUPTED' && error.error?.requestId === id
  const disconnected = error instanceof TypeError && ['UND_ERR_SOCKET', 'ECONNRESET'].includes(error.cause?.code)
  if (!interrupted && !disconnected) return false

  const calls = output.content.filter(block => block.type === 'toolCall')
  if (!calls.length) return ['stop', 'length'].includes(output.stopReason)
  if (output.stopReason !== 'toolUse' || new Set(calls.map(call => call.id)).size !== calls.length) return false
  // SDK streaming parsers can repair incomplete JSON. Only execute explicitly
  // finished native calls whose complete arguments were actually received.
  return calls.every(call => {
    if (!call.id || !call.name || call.customInput || typeof call.partialArgs !== 'string') return false
    try {
      const args = JSON.parse(call.partialArgs)
      return args !== null && typeof args === 'object' && !Array.isArray(args)
    } catch { return false }
  })
}

export function patchHostedChatStreamTail(source) {
  const start = '            for await (const chunk of openaiStream) {'
  const choice = '                if (!choice)\n                    continue;'
  const track = '\n                finalReason = chunk.choices.length === 1 && choice.index === 0 ? choice.finish_reason : undefined;'
  const end = '            for (const block of blocks) {\n                finishBlock(block);'
  const intercept = '            } catch (error) {\n' +
    '                if (!completedHostedResponse(model, options, response, error, finalReason, output)) throw error;\n' +
    '            }\n'
  const helper = marker + '\n' + completedHostedResponse.toString() + '\n'
  if (source.startsWith(helper) && source.includes(intercept) && source.includes(track)) return source
  if (source.includes(marker) || source.split(start).length !== 2 || source.split(end).length !== 2 || source.split(choice).length !== 2) {
    throw Error('Hosted completion stream SDK boundary drifted')
  }
  return helper + source.replace(start, '            let finalReason;\n            try {\n' + start).replace(choice, choice + track).replace(end, intercept + end)
}
