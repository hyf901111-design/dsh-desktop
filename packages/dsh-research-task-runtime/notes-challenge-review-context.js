import { uniqueQuote } from './notes-challenge-bounds.js'

export const REVIEW_ANCHOR_LIMITS = Object.freeze({ count: 64, chars: 8000, quote: 2000 })

export function challengeReviewAnchors(anchors, blocks) {
  const groups = new Map(blocks.map(block => [block.id, { text: block.text, quotes: [], seen: new Set() }]))
  for (const anchor of anchors) {
    const group = groups.get(anchor?.blockId), quote = anchor?.quote
    if (!group || typeof quote !== 'string' || quote.length > REVIEW_ANCHOR_LIMITS.quote || group.quotes.length >= REVIEW_ANCHOR_LIMITS.count || group.seen.has(quote) || !uniqueQuote(group.text, quote)) continue
    group.seen.add(quote); group.quotes.push(quote)
  }
  for (const group of groups.values()) group.quotes.sort((a, b) => group.text.indexOf(a) - group.text.indexOf(b) || a.length - b.length)
  const result = []; let chars = 2
  for (let round = 0; result.length < REVIEW_ANCHOR_LIMITS.count && [...groups.values()].some(group => group.quotes.length > round); round++) {
    for (const [blockId, group] of groups) {
      const quote = group.quotes[round]
      if (quote === undefined) continue
      const value = { blockId, quote }, size = JSON.stringify(value).length + (result.length ? 1 : 0)
      if (chars + size > REVIEW_ANCHOR_LIMITS.chars) continue
      result.push(value); chars += size
      if (result.length === REVIEW_ANCHOR_LIMITS.count) break
    }
  }
  return result
}
