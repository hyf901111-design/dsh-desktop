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
  const links = new Map<string, { title: string; url: string; date?: string }>()
  let linkBytes = 0
  let text = '', previous = '', stableBottom = 0, images = 0, complete = false
  let scroller: Element | null = null
  let first = true
  const clean = (value: string) => value.replace(/[\u200b\ufeff]/g, '').trim()
  const collectLinks = (root: Element) => {
    let scanned = 0
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (++scanned > 2000) break
      if (anchor.closest('nav,header,footer,[hidden],[aria-hidden="true"],pre,code') || anchor.getAttribute('href')?.startsWith('#')) continue
      const title = clean(anchor.innerText).replace(/\s+/g, ' ')
      if (!title || title.length > 256) continue
      let url: URL
      try { url = new URL(anchor.href); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) continue } catch { continue }
      // Old news lists are often text + anchor + <br>, without li wrappers.
      // Stop at adjacent links/rows so one story cannot borrow another's date.
      const adjacent = (direction: 'previousSibling' | 'nextSibling') => {
        let node = anchor[direction], value = ''
        for (let n = 0; node && n < 6; node = node[direction], n++) {
          if (node.nodeType === 1 && /^(?:A|BR|LI|TR|DIV|P|UL|OL|TABLE)$/i.test((node as Element).tagName)) break
          if (node.nodeType === 1 && (node as Element).querySelector('a')) break
          value += ' ' + (node.textContent ?? '')
        }
        return value
      }
      let context = adjacent('previousSibling') + ' ' + adjacent('nextSibling')
      const row = anchor.closest('li,tr,p')
      if (row && row.querySelectorAll('a[href]').length === 1 && (row.textContent?.length ?? 0) <= 700) context = row.textContent ?? context
      const dates = [...new Set(context.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])].filter(date => Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date)
      const link = { title, url: url.href, ...(dates.length === 1 ? { date: dates[0] } : {}) }
      const key = JSON.stringify(link)
      if (links.has(key)) continue
      // Generic site navigation can precede the entire news list. A dated
      // source record takes priority over an undated utility/navigation link.
      while (link.date && (links.size >= 200 || linkBytes + key.length > 50_000)) {
        const undated = [...links.entries()].find(([, value]) => !value.date)
        if (!undated) break
        links.delete(undated[0]); linkBytes -= undated[0].length
      }
      if (links.size >= 200 || linkBytes + key.length > 50_000) continue
      links.set(key, link); linkBytes += key.length
    }
  }
  const primaryArticle = () => {
    const normalize = (value: string) => clean(value).replace(/\s+/g, ' ')
    const titles = [...new Set([...document.querySelectorAll<HTMLElement>('h1')]
      .filter(el => !el.closest('[hidden],[aria-hidden="true"],nav,footer'))
      .map(el => normalize(el.innerText)).filter(value => value.length > 0 && value.length <= 256))]
    if (!titles.length && [...document.querySelectorAll<HTMLMetaElement>('meta[property="og:type"]')].some(meta => meta.content.toLowerCase() === 'article')) {
      const metadataTitles = [...new Set([...document.querySelectorAll<HTMLMetaElement>('meta[property="og:title"]')].map(meta => normalize(meta.content)).filter(value => value.length > 0 && value.length <= 256))]
      if (metadataTitles.length === 1) titles.push(metadataTitles[0]!)
    }
    if (titles.length !== 1) return
    const title = titles[0]!, dates = new Set<string>()
    const date = (value: unknown) => {
      if (typeof value !== 'string') return
      const found = value.match(/^\d{4}-\d{2}-\d{2}(?=$|[T\s])/u)?.[0]
      return found && Number.isFinite(Date.parse(found)) && new Date(found).toISOString().slice(0, 10) === found ? found : undefined
    }
    // Publication metadata belongs to the page. Arbitrary dates in body text,
    // modified timestamps, comments and recommended-link dates are not dates
    // of this article. Conflicting publication metadata stays unresolved.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta')) {
      const key = (meta.getAttribute('property') ?? meta.name).toLowerCase()
      if (key === 'og:title' && normalize(meta.content) !== title) return
      if (!['article:published_time','datepublished','publishdate','pubdate'].includes(key)) continue
      const value = date(meta.content); if (value) dates.add(value)
    }
    for (const time of document.querySelectorAll<HTMLTimeElement>('article time[itemprop="datePublished"],main time[itemprop="datePublished"],article time[pubdate]')) {
      const value = date(time.dateTime); if (value) dates.add(value)
    }
    let visited = 0
    const visit = (value: unknown, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 6 || ++visited > 200) return
      if (Array.isArray(value)) { for (const item of value.slice(0, 40)) visit(item, depth + 1); return }
      const item = value as Record<string, unknown>, types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
      if (types.some(type => typeof type === 'string' && /^(?:NewsArticle|Article|BlogPosting|ScholarlyArticle|Report)$/.test(type)) && typeof item.headline === 'string' && normalize(item.headline) === title) {
        let samePage = item.url === undefined
        if (typeof item.url === 'string') {
          try { const url = new URL(item.url, location.href), current = new URL(location.href); url.hash = ''; current.hash = ''; samePage = url.href === current.href } catch {}
        }
        const published = samePage && date(item.datePublished)
        if (published) dates.add(published)
      }
      // Only explicit JSON-LD graphs, not related/hasPart article objects.
      if (item['@graph']) visit(item['@graph'], depth + 1)
    }
    for (const script of [...document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')].slice(0, 32)) {
      if (!script.textContent || script.textContent.length > 100_000) continue
      try { visit(JSON.parse(script.textContent)) } catch {}
    }
    if (dates.size === 1) return { title, date: [...dates][0] }
  }
  const content = () => blocks.size
    ? [...blocks.values()].sort((a, b) => a.order - b.order).map(b => b.text).filter(Boolean).join('\n\n')
    : text
  while (Date.now() < deadline) {
    const doc = document.querySelector('.docx-page-block')
    // Do not mistake a Feishu SPA loading shell for a complete document.
    if (!doc && /(^|\.)feishu\.cn$/.test(location.hostname) && /^\/(wiki|docx)\//.test(location.pathname)) { await pause(); continue }
    const root = doc ?? document.querySelector('main,article,[role=main]') ?? document.body
    if (!root) { await pause(); continue }
    collectLinks(root)
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
  const article = primaryArticle()
  return { title: document.title, ...(article ? { article } : {}), sourceText: content().slice(0, 120_000), complete: complete && missingHeadings.length === 0,
    missingHeadings: missingHeadings.length, images, blockCount: blocks.size, links: [...links.values()].sort((a, b) => Number(Boolean(b.date)) - Number(Boolean(a.date))) }
}
