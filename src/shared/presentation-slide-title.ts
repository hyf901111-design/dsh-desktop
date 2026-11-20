/** PowerPoint masters may contain footers or off-page instructions ahead of the title in XML order. */
export function slideTitle(
  slide: {
    elements: { type: string; left: number; top: number; content?: string; text?: { content: string } }[]
  },
  width: number,
  ratio: number,
  toText: (html: string) => string
) {
  const candidates = slide.elements
    .map((e) => ({ ...e, content: e.type === 'shape' ? e.text?.content : e.content }))
    .filter(
      (e) =>
        (e.type === 'text' || e.type === 'shape') &&
        e.content &&
        e.left >= -1 &&
        e.left < width &&
        e.top >= -1 &&
        e.top < width * ratio * 0.65
    )
    .map((element) => ({
      element,
      size: Math.max(
        0,
        ...Array.from(element.content!.matchAll(/font-size:\s*([\d.]+)/gi), (m) => Number(m[1]))
      )
    }))
    .sort((a, b) => b.size - a.size || a.element.top - b.element.top)
  for (const { element } of candidates) {
    const text = toText(element.content!).trim()
    if (text) return text.slice(0, 120)
  }
  return ''
}
