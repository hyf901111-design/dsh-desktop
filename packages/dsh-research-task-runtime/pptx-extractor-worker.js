import { parentPort, workerData } from 'node:worker_threads'
import { strFromU8, unzipSync } from 'fflate'

function decodeXmlText(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/giu, (entity, code) => {
    if (code === 'amp') return '&'
    if (code === 'apos') return "'"
    if (code === 'gt') return '>'
    if (code === 'lt') return '<'
    if (code === 'quot') return '"'
    const numeric = code[1]?.toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10)
    try {
      return Number.isSafeInteger(numeric) ? String.fromCodePoint(numeric) : entity
    } catch {
      return entity
    }
  })
}

function extractSlide(xml) {
  const parts = []
  const tokenPattern = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?\s*>|<a:tab\b[^>]*\/?\s*>|<\/a:p\s*>/giu
  for (const match of xml.matchAll(tokenPattern)) {
    if (match[1] !== undefined) parts.push(decodeXmlText(match[1]))
    else if (/^<a:tab/iu.test(match[0])) parts.push('\t')
    else parts.push('\n')
  }
  return parts.join('').replace(/[ \t]+\n/gu, '\n').replace(/\n{2,}/gu, '\n').trim()
}

try {
  const { data, maxSlides, maxSlideXmlBytes, maxTotalXmlBytes } = workerData
  let slideCount = 0, totalXmlBytes = 0
  const archive = unzipSync(data, { filter(file) {
    if (!/^ppt\/slides\/slide\d+\.xml$/u.test(file.name)) return false
    slideCount += 1
    totalXmlBytes += file.originalSize
    if (slideCount > maxSlides || file.originalSize > maxSlideXmlBytes || totalXmlBytes > maxTotalXmlBytes) throw new Error('SOURCE_TOO_LARGE')
    return true
  } })
  const slides = Object.entries(archive)
    .map(([name, bytes]) => ({ number: Number.parseInt(name.match(/^ppt\/slides\/slide(\d+)\.xml$/u)?.[1] ?? '', 10), text: extractSlide(strFromU8(bytes)) }))
    .filter((slide) => Number.isSafeInteger(slide.number) && slide.text.length > 0)
    .sort((left, right) => left.number - right.number)
    .map((slide) => `第 ${slide.number} 页\n${slide.text}`)
  parentPort.postMessage({ text: slides.join('\n\n') })
} catch (error) {
  parentPort.postMessage({ error: error.message === 'SOURCE_TOO_LARGE' ? 'SOURCE_TOO_LARGE' : 'SOURCE_UNREADABLE' })
} finally {
  parentPort.close()
}
