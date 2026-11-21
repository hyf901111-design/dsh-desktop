// A no-tool opening should contain a public introduction. Some compatible
// providers serialize their internal call envelope as ordinary text instead.
export function taskOpeningText(componentOpening = false, onSource) {
  const callHeader = '<｜｜DSML｜｜ calls>'
  const asciiStart = '<|tool_call_start|>'
  const asciiName = /^<\|tool_call_start\|>[a-zA-Z_][a-zA-Z0-9_.:-]{0,127}<\|tool_call_end\|>(?:\r?\n)?$/u
  const argumentsStart = '<|tool_call_argument_start|>'
  let prefix = '', atLineStart = true, fence = '', hidden = false
  return {
    get hidden() { return hidden },
    read(text, final = false) {
      if (hidden) return ''
      let output = ''
      const lines = (prefix + text).split(/(?<=\n)/u)
      prefix = ''
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const complete = line.endsWith('\n')
        if (atLineStart) {
          // Four-space code and quoted/inline examples cannot be protocol.
          const head = line.replace(/^ {0,3}/u, '')
          // The paired ASCII control lines can straddle arbitrary deltas.
          // Keep a lone literal header when the following text is ordinary prose.
          if (!fence && (asciiStart.startsWith(head) || head.startsWith(asciiStart)) && head.length <= 172) {
            if (!complete && !final) {
              prefix = line
              break
            }
            if (final && !complete && head.startsWith('<|tool_call_') && asciiStart.startsWith(head)) {
              hidden = true
              break
            }
            if (asciiName.test(head)) {
              const next = (lines[i + 1] ?? '').replace(/^ {0,3}/u,'')
              if (next.startsWith(argumentsStart) || final && argumentsStart.startsWith(next)) {
                hidden = true
                break
              }
              if (!final && argumentsStart.startsWith(next)) {
                prefix = lines.slice(i).join('')
                break
              }
            }
          }
          const delimiter = /^(`{3,}|~{3,})/u.exec(head)?.[1]
          if (componentOpening) {
            const lower=head.toLowerCase()
            const starts=['<!doctype html','<html','<head','<body','<table','<div','<svg','<section','<style','<script']
            if (delimiter || starts.some(tag=>lower.startsWith(tag) && /^[\s/>]/u.test(lower.slice(tag.length)))) {
              hidden = true
              onSource?.()
              break
            }
            if (!complete && !final && lower.startsWith('<') && starts.some(tag=>tag.startsWith(lower))) {
              prefix=line
              break
            }
          }
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

export async function* publicTaskOpeningStream(stream, componentOpening = false, onSource) {
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
      if (!blocks.has(chunk.index)) blocks.set(chunk.index, taskOpeningText(componentOpening,onSource))
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
      const final = taskOpeningText(componentOpening,onSource)
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
  const hostedFlash = request.provider === 'ework-ark' && request.model === 'deepseek-v4.1-flash'
  const limit = request.maxTokens ?? (hostedFlash ? 2048 : 384)
  const budgets = [Math.min(limit,hostedFlash ? 1024 : 384)]
  if (hostedFlash && limit > 1024) budgets.push(Math.min(limit,2048))
  const usage = {}
  for (const [attempt,maxTokens] of budgets.entries()) {
    const capped = prepared && (request.maxTokens === maxTokens ? prepared :
      await llm.prepareCall({...prepared.config, maxTokens}, signal))
    signal.throwIfAborted()
    const opening = request.maxTokens === maxTokens ? request : mark(freeze({...request,maxTokens,...capped?.config}))
    let draftedSource = false
    const stream = publicTaskOpeningStream(capped?.stream(opening) ?? llm.stream(opening),
      request[Symbol.for('ework.native-component-opening')] === true, () => { draftedSource = true })
    let publicText = false
    const pending = []
    for await (const chunk of stream) {
      if (chunk.type === 'usage') {
        for (const [key,value] of Object.entries(chunk.usage)) {
          if (typeof value === 'number') usage[key] = (usage[key] ?? 0) + value
        }
      } else if (chunk.type === 'finish') {
        // Only retry actual token exhaustion with zero words. Never repeat a
        // public introduction, transport error or cancelled request.
        if (chunk.reason.kind === 'max-tokens' && !publicText && !draftedSource && attempt + 1 < budgets.length) break
        if (Object.keys(usage).length) yield {type:'usage',usage}
        yield chunk
        return
      } else if (publicText) {
        yield chunk
      } else {
        pending.push(chunk)
        const words = chunk.type === 'text-delta' ? chunk.text :
          chunk.type === 'block-end' && chunk.block.type === 'text' ? chunk.block.text : ''
        if (words?.trim()) {
          publicText = true
          yield* pending
          pending.length = 0
        }
      }
    }
  }
}
