/** Versioned workspace context on an ordinary native user turn. */
export function readImageFactoryContext(text) {
  if (typeof text !== 'string') return
  const match = /\n<odyssey-image-workspace-v1>\n([^\n]{1,600})\n<\/odyssey-image-workspace-v1>$/u.exec(text)
  if (!match) return
  try {
    const value = JSON.parse(match[1])
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.id) ||
        !['generate', 'edit', 'region'].includes(value.operation) ||
        !['1024x1024', '1024x1536', '1536x1024'].includes(value.size) ||
        !Number.isInteger(value.width) || value.width < 1 || value.width > 4096 ||
        !Number.isInteger(value.height) || value.height < 1 || value.height > 4096 ||
        typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 100 ||
        typeof value.internalReference !== 'boolean') return
    return { id: value.id, operation: value.operation, size: value.size, width: value.width, height: value.height,
      title: value.title, internalReference: value.internalReference, text: text.slice(0, match.index) }
  } catch { return }
}

export function stripImageFactoryContext(text) {
  return readImageFactoryContext(text)?.text ?? text
}

export function imageFactoryPrompt(text, context) {
  return stripImageFactoryContext(text) + '\n<odyssey-image-workspace-v1>\n' + JSON.stringify(context) + '\n</odyssey-image-workspace-v1>'
}
