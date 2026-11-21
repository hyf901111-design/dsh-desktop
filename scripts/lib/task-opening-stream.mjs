// A no-tool opening should contain a public introduction. Some compatible
// providers serialize their internal call envelope as ordinary text instead.
export function taskOpeningText() {
  const callHeader = '<｜｜DSML｜｜ calls>'
  let prefix = '', atLineStart = true, fence = '', hidden = false
  return {
    get hidden() { return hidden },
    read(text, final = false) {
      if (hidden) return ''
      let output = ''
      const lines = (prefix + text).split(/(?<=\n)/u)
      prefix = ''
      for (const line of lines) {
        const complete = line.endsWith('\n')
        if (atLineStart) {
          // Four-space code and quoted/inline examples cannot be protocol.
          const head = line.replace(/^ {0,3}/u, '')
          const delimiter = /^(`{3,}|~{3,})/u.exec(head)?.[1]
          const unfinishedDelimiter = /^[`~]+$/u.test(head)
          if (!complete && !final && (!head || unfinishedDelimiter ||
              !fence && head !== callHeader && callHeader.startsWith(head))) {
            prefix = line
            break
          }
          if (fence) {
            if (delimiter?.startsWith(fence) && head.slice(delimiter.length).trim() === '') fence = ''
          } else if (delimiter) {
            fence = delimiter
          } else if (head.startsWith(callHeader) || final && head.startsWith('<｜｜DSML｜｜') && callHeader.startsWith(head)) {
            hidden = true
            break
          }
        }
        output += line
        atLineStart = complete
      }
      return output
    },
  }
}

export async function* publicTaskOpeningStream(stream) {
  const blocks = new Map()
  let edited = false, protocolIndex
  for await (const chunk of stream) {
    if (chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta' ||
        chunk.type === 'block-start' && ['reasoning','tool-call'].includes(chunk.blockType) ||
        chunk.type === 'block-end' && ['reasoning','tool-call'].includes(chunk.block.type)) {
      edited = true
      continue
    }
    if (chunk.type === 'text-delta') {
      if (protocolIndex !== undefined) continue
      if (!blocks.has(chunk.index)) blocks.set(chunk.index, taskOpeningText())
      const state = blocks.get(chunk.index)
      const text = state.read(chunk.text)
      if (state.hidden) { edited = true; protocolIndex = chunk.index }
      if (text) yield {...chunk, text}
      continue
    }
    if (chunk.type === 'block-end' && chunk.block.type === 'text') {
      if (protocolIndex !== undefined && protocolIndex !== chunk.index) continue
      const open = blocks.get(chunk.index)
      const suffix = open?.read('', true)
      if (suffix) yield {type:'text-delta', index:chunk.index, text:suffix}
      blocks.delete(chunk.index)
      // The SDK treats block-end as authoritative, including snapshot-only streams.
      const final = taskOpeningText()
      const text = final.read(chunk.block.text, true)
      if (final.hidden) { edited = true; protocolIndex = chunk.index }
      yield {...chunk, block:{...chunk.block, text}}
      continue
    }
    if (chunk.type === 'finish') {
      for (const [index, state] of blocks) {
        const suffix = state.read('', true)
        if (state.hidden) edited = true
        if (suffix && (protocolIndex === undefined || protocolIndex === index)) yield {type:'text-delta', index, text:suffix}
      }
      blocks.clear()
      if (edited && chunk.replayState !== undefined) {
        const {replayState, ...finish} = chunk
        yield finish
        continue
      }
    }
    yield chunk
  }
}

// prepareCall binds both the adapter and the exact call configuration. The
// opening gets its own capped call; execution keeps the selected model budget.
export async function* boundedTaskOpeningStream(llm, prepared, request, signal, mark, freeze) {
  // The hosted Flash route counts mandatory reasoning against the same
  // output limit as public text. Respect a smaller explicit session limit.
  const budget = request.provider === 'ework-ark' && request.model === 'deepseek-v4.1-flash' ? 1024 : 384
  const maxTokens = Math.min(request.maxTokens ?? budget, budget)
  if (request.maxTokens === maxTokens) {
    yield* publicTaskOpeningStream(prepared?.stream(request) ?? llm.stream(request))
    return
  }
  const capped = prepared && await llm.prepareCall({...prepared.config, maxTokens}, signal)
  signal.throwIfAborted()
  const opening = mark(freeze({...request, maxTokens, ...capped?.config}))
  yield* publicTaskOpeningStream(capped?.stream(opening) ?? llm.stream(opening))
}
