const RESPONSE_BYTES = 8 * 1024 * 1024

export async function boundedText(body, limit, signal) {
  const reader = body?.getReader()
  if (!reader) throw new Error('Missing body')
  const chunks = []
  let size = 0
  let abort
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new Error('Request timed out'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), cancelled])
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Response too large')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder().decode(bytes)
  } finally {
    signal.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
  }
}

function parseRpc(text, contentType, id) {
  let values
  if (contentType.includes('text/event-stream')) {
    values = text.replace(/\r\n/g, '\n').split('\n\n').flatMap(event => {
      const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      return data ? [JSON.parse(data)] : []
    })
  } else values = [JSON.parse(text)]
  const reply = values.find(value => value?.jsonrpc === '2.0' && value.id === id && ('result' in value || 'error' in value))
  return reply
}

export async function readRpc(response, id, signal) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    const reply = parseRpc(await boundedText(response.body, RESPONSE_BYTES, signal), contentType, id)
    if (!reply) throw new Error('Invalid MCP response')
    return reply
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing body')
  const decoder = new TextDecoder()
  let buffer = '', size = 0, abort
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new Error('Request timed out'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), cancelled])
      if (done) throw new Error('Missing RPC result')
      size += value.byteLength
      if (size > RESPONSE_BYTES) throw new Error('Response too large')
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const reply = parseRpc(event, contentType, id)
        if (reply) return reply
      }
    }
  } finally {
    signal.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
  }
}
