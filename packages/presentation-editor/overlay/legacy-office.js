import signatures from './legacy-office-signatures.json'
import { restoreOfficeFormatting } from './office-import'

// Compare the stored object, including user formatting, before upgrading from the old importer.
// IDs are generated per import. PPTist also measures table height from the rendered DOM.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== 'id')
      .sort()
      .map((key) => [key, canonical(value[key])])
  )
}

async function fingerprint(model) {
  const plain = canonical(model)
  if (plain.type === 'table') delete plain.height
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(plain)))
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('')
}

export async function upgradeEfundTemplate(deck) {
  const slides = deck.slides
  if (slides.length !== signatures.length || slides.every((s) => s.odysseyOfficeVersion)) return false
  const hasTitle = (index, text) =>
    slides[index]?.elements.some((el) => el.type === 'text' && el.content.includes(text))
  if (!hasTitle(0, '重要提醒') || !hasTitle(1, '易方达PPT模板')) return false
  const eligible = new Set()
  for (const [index, slide] of slides.entries()) {
    if (slide.odysseyOfficeVersion) continue
    for (const el of slide.elements) {
      if (el.odysseyMaster || !['table', 'chart', 'shape'].includes(el.type) || !signatures[index].length)
        continue
      if (!signatures[index].includes(await fingerprint(el))) continue
      if (el.type === 'shape') {
        // PPTist emitted imported circular-arrow paths in points, then fitted only the visible arc.
        const pointsPerUnit = 720 / deck.viewportSize
        el.viewBox = [el.width * pointsPerUnit, el.height * pointsPerUnit]
      } else eligible.add(el)
    }
  }
  const response = await fetch('./efund.pptx')
  if (!response.ok) return false
  await restoreOfficeFormatting(await response.arrayBuffer(), slides, deck.viewportSize, (model) =>
    eligible.has(model)
  )
  return true
}
