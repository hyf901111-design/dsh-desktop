/** Runs only in a disposable reader window, never scrolls a user's visible page. */
export function renderedPageContentScript(maxMilliseconds = 60_000): string {
  return `(${collectRenderedPage.toString()})(${maxMilliseconds})`
}

async function collectRenderedPage(maxMilliseconds: number) {
  const deadline = Date.now() + maxMilliseconds
  const pause = () => new Promise(resolve => setTimeout(resolve, 350))
  const blocks = new Map<string, { order: number; text: string }>()
  const headings = new Set<string>()
  const seenHeadings = new Set<string>()
  let text = '', previous = '', stableBottom = 0, images = 0, complete = false
  let scroller: Element | null = null
  let first = true
  const clean = (value: string) => value.replace(/[\u200b\ufeff]/g, '').trim()
  const content = () => blocks.size
    ? [...blocks.values()].sort((a, b) => a.order - b.order).map(b => b.text).filter(Boolean).join('\n\n')
    : text
  while (Date.now() < deadline) {
    const doc = document.querySelector('.docx-page-block')
    // Do not mistake a Feishu SPA loading shell for a complete document.
    if (!doc && /(^|\.)feishu\.cn$/.test(location.hostname) && /^\/(wiki|docx)\//.test(location.pathname)) { await pause(); continue }
    const root = doc ?? document.querySelector('main,article,[role=main]') ?? document.body
    if (!root) { await pause(); continue }
    if (!scroller || !scroller.isConnected) {
      let parent: Element | null = root
      while (parent && !(parent.clientHeight > 100 && parent.scrollHeight > parent.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement
      scroller = parent ?? document.scrollingElement
      // Generic pages may place an article inside a nested scroll container.
      if (first && scroller) { scroller.scrollTop = 0; first = false; await pause(); continue }
    }
    if (doc) {
      for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
        const id = link.getAttribute('href')?.slice(1)
        if (id && /^\d+(?:\.\d+)*\.?\s/.test(clean(link.innerText))) headings.add(id)
      }
      for (const block of doc.querySelectorAll<HTMLElement>('[data-block-id]')) {
        const type = block.getAttribute('data-block-type')
        const id = block.getAttribute('data-record-id') ?? block.getAttribute('data-block-id')!
        if (type?.startsWith('heading')) seenHeadings.add(id)
        // Container blocks include unmounted placeholders. Capture leaves only,
        // keyed by stable record IDs so repeated wording is not thrown away.
        if (block.querySelector('[data-block-id]') || type === 'back_ref_list') continue
        const value = clean(block.innerText)
        const image = type === 'image'
        if (value || image) blocks.set(id, { order: Number(block.getAttribute('data-block-id')), text: image ? '[图片：网页插图，未提取图片内文字]' : value })
      }
      images = [...blocks.values()].filter(b => b.text.startsWith('[图片：')).length
    } else {
      const value = clean((root as HTMLElement).innerText)
      // Normal lazy pages retain their DOM. Preserve the longest observed body.
      if (value.length > text.length) text = value
    }
    const body = content()
    if (body.length >= 120_000) break
    const bottom = !scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
    const signature = body + '|' + (scroller?.scrollHeight ?? 0)
    stableBottom = bottom && signature === previous ? stableBottom + 1 : 0
    previous = signature
    // Top-of-page stability alone never means the document is complete.
    if (stableBottom >= 5 && body.length > 100) { complete = true; break }
    if (scroller && !bottom) scroller.scrollTop += Math.max(100, scroller.clientHeight * .65)
    await pause()
  }
  const missingHeadings = [...headings].filter(id => !seenHeadings.has(id))
  return { title: document.title, sourceText: content().slice(0, 120_000), complete: complete && missingHeadings.length === 0,
    missingHeadings: missingHeadings.length, images, blockCount: blocks.size }
}
