// Keep sentences intact where possible. Limit UTF-16 length to the gateway's
// bound, without cutting a supplementary character at a chunk boundary.
export function speechChunks(text) {
  const result = []
  let chunk = ''
  for (const sentence of text.match(/[^。！？.!?\n]+[。！？.!?\n]*|[。！？.!?\n]+/gu) || []) {
    if (chunk.length + sentence.length > 600 && chunk.trim()) {
      result.push(chunk.trim())
      chunk = ''
    }
    for (const char of sentence) {
      if (chunk.length + char.length > 600) {
        if (chunk.trim()) result.push(chunk.trim())
        chunk = ''
      }
      chunk += char
    }
  }
  if (chunk.trim()) result.push(chunk.trim())
  return result
}

// One run belongs to one slide. Navigation, exit and replacement invalidate
// both outstanding synthesis and late events from the previous audio element.
export function createNarrator({ load, changed, finished, makeAudio = () => new Audio() }) {
  let current
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
    const run = current
    current = undefined
    if (run) {
      run.abort.abort()
      release(run)
    }
    changed('idle', '')
  }
  function failed(run, error) {
    if (run !== current) return
    stop()
    changed('idle', error?.message || '音频播放失败，请重试。')
  }
  async function playAudio(run) {
    const audio = run.audio
    const attempt = ++run.attempt
    try {
      await audio.play()
      if (current === run && !run.paused && audio === run.audio && attempt === run.attempt) changed('playing', '')
    } catch (error) {
      if (!run.paused && attempt === run.attempt && audio === run.audio) failed(run, error)
    }
  }
  async function next(run) {
    release(run)
    if (run.index >= run.parts.length) {
      stop()
      finished()
      return
    }
    changed('loading', '')
    try {
      const blob = await load(run.parts[run.index++], run.demo, run.abort.signal)
      if (current !== run) return
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
      current = { parts: demo ? [text.trim()] : speechChunks(text), index: 0, attempt: 0, demo, paused: false, abort: new AbortController() }
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
