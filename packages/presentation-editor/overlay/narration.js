// Segment at spoken boundaries, preserving decimals, surrogate pairs and sentence order.
const sentences = new Intl.Segmenter('zh', { granularity: 'sentence' })
export function speechChunks(text) {
  const parts = []
  for (const { segment } of sentences.segment(text.trim())) {
    const chars = Array.from(segment.trim())
    while (chars.length) {
      const limit = parts.length ? 72 : 42
      let n = Math.min(limit, chars.length)
      if (n < chars.length) {
        const prefix = chars.slice(0, n).join('')
        const pauses = [...prefix.matchAll(/[，；：、]|[,;:](?!\d)|\s+/gu)]
        const boundary = pauses.at(-1)
        if (boundary) n = Array.from(prefix.slice(0, boundary.index + boundary[0].length)).length
      }
      const chunk = chars.splice(0, n).join('').trim()
      if (chunk) parts.push(chunk)
    }
  }
  // Keep the opening independent. Group brief list items later in the script
  // so a slide with many short sentences can play within the speech rate limit.
  const groups = []
  for (const part of parts) {
    const previous = groups.at(-1)
    if (groups.length > 1 && previous.length < 18 && previous.length + part.length < 55) {
      const gap = /[a-z0-9.!?]$/i.test(previous) && /^[a-z0-9]/i.test(part) ? ' ' : ''
      groups[groups.length - 1] = previous + gap + part
    } else groups.push(part)
  }
  return groups
}

export function createNarrator({ load, changed, finished, nextNotes = () => '', makeAudio = () => new Audio() }) {
  let current
  const prepared = new Map()
  function prepare(text, demo) {
    let task = prepared.get(text)
    if (!task) {
      const abort = new AbortController()
      const result = load(text, demo, abort.signal)
      // A speculative failure is surfaced only if playback reaches this segment.
      result.catch(() => {})
      task = { abort, result }
      prepared.set(text, task)
    }
    return task.result
  }
  function release(run) {
    if (!run.audio) return
    run.audio.onended = run.audio.onerror = null
    run.audio.pause()
    run.audio.removeAttribute('src')
    run.audio.load()
    URL.revokeObjectURL(run.url)
    run.audio = undefined
  }
  function stop() {
    if (current) release(current)
    current = undefined
    for (const task of prepared.values()) task.abort.abort()
    prepared.clear()
    changed('idle', '')
  }
  function failed(run, error) {
    if (current !== run) return
    stop()
    changed('idle', error?.message || '音频播放失败，请重试。')
  }
  function lookAhead(run) {
    if (run.demo || run.paused) return
    for (const part of run.parts.slice(run.index, run.index + 2)) prepare(part, false)
    // Start the following page while this page is audible. Near the turn, also
    // prepare its second sentence so a short opening can continue smoothly.
    const next = speechChunks(nextNotes())
    for (const part of next.slice(0, run.parts.length - run.index <= 1 ? 2 : 1)) prepare(part, false)
  }
  async function playAudio(run) {
    const audio = run.audio
    const attempt = ++run.attempt
    try {
      await audio.play()
      if (current === run && !run.paused && audio === run.audio && attempt === run.attempt) {
        changed('playing', '')
        lookAhead(run)
      }
    } catch (error) {
      if (!run.paused && attempt === run.attempt && audio === run.audio) failed(run, error)
    }
  }
  async function next(run) {
    release(run)
    if (run.index >= run.parts.length) {
      current = undefined
      finished()
      if (!current) stop()
      return
    }
    changed('loading', '')
    const text = run.parts[run.index++]
    try {
      const result = prepare(text, run.demo)
      // Starting the second request now avoids a gap after a very short greeting.
      if (!run.demo && !run.paused && run.parts[run.index]) prepare(run.parts[run.index], false)
      // A one-sentence page can finish before the next opening is synthesized.
      if (!run.demo && run.parts.length === 1) {
        const opening = speechChunks(nextNotes())[0]
        if (opening) prepare(opening, false)
      }
      const blob = await result
      if (current !== run) return
      prepared.delete(text)
      run.url = URL.createObjectURL(blob)
      const audio = run.audio = makeAudio()
      audio.onended = () => { if (current === run && !run.paused && run.audio === audio) void next(run) }
      audio.onerror = () => failed(run, Error('无法播放这段音频，请重试。'))
      audio.src = run.url
      if (!run.paused) await playAudio(run)
    } catch (error) { failed(run, error) }
  }
  function toggle(text, demo = false) {
    if (!text.trim()) return
    if (!current) {
      current = { parts: demo ? [text.trim()] : speechChunks(text), index: 0, attempt: 0, demo, paused: false }
      void next(current)
    } else if (!current.paused) {
      current.paused = true
      ++current.attempt
      current.audio?.pause()
      changed('paused', '')
    } else {
      current.paused = false
      changed('loading', '')
      if (current.audio) void playAudio(current)
    }
  }
  return { stop, toggle }
}
