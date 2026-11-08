/** Runs only in a disposable reader window, never scrolls a user's visible page. */
export function renderedPageContentScript(maxMilliseconds = 60_000): string {
  return `(${collectRenderedPage.toString()})(${maxMilliseconds})`
}

async function collectRenderedPage(maxMilliseconds: number) {
  // A structured response is one complete transport document. Scrolling its
  // pretty-printed viewer adds latency and can lose the original JSON layout.
  // Never extract an embedded example from an HTML page through this path.
  if (/^(?:application\/(?:[\w.+-]+\+)?json|text\/plain)(?:;|$)/i.test(document.contentType)) {
    const raw = document.body?.innerText ?? ''
    let complete = false
    try { const value = JSON.parse(raw); complete = Boolean(value && typeof value === 'object') && raw.length < 120_000 } catch {}
    return { title: document.title, sourceText: raw.slice(0, 120_000), complete, missingHeadings: 0, images: 0, blockCount: 0, links: [] }
  }
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
  const hidden = (element: Element) => {
    let node: Element | null = element
    for (let depth = 0; node; depth++, node = node.parentElement) {
      if (depth > 32 || node.matches('[hidden],[aria-hidden="true"],script,style,template,noscript')) return true
      // Closed details expose only their first summary, even when computed
      // styles and textContent still include the collapsed descendants.
      if (node.matches('details:not([open])') && node !== element && !node.querySelector(':scope > summary')?.contains(element)) return true
      const style = getComputedStyle(node)
      if (style.display === 'none' || /^(hidden|collapse)$/.test(style.visibility) || style.opacity === '0' || style.contentVisibility === 'hidden') return true
    }
    return false
  }
  // Only small visible neighborhoods may provide a link's publication date.
  // textContent includes hidden timestamps, while innerText on a hidden child
  // can still return text; explicitly omit those branches and bound traversal.
  const localText = (root: Node) => {
    let visited = 0, size = 0, bounded = true
    const visit = (node: Node, depth: number): string => {
      if (++visited > 80 || depth > 6) { bounded = false; return '' }
      if (node.nodeType === 3) {
        const value = node.textContent ?? ''
        if ((size += value.length) > 700) bounded = false
        return value
      }
      if (node.nodeType !== 1 || hidden(node as Element)) return ''
      if ((node as Element).matches('details:not([open])')) {
        const summary = (node as Element).querySelector(':scope > summary')
        return summary ? visit(summary, depth + 1) : ''
      }
      const values: string[] = []
      for (const child of node.childNodes) {
        values.push(visit(child, depth + 1))
        if (!bounded) break
      }
      return values.join(' ')
    }
    const value = visit(root, 0)
    return bounded ? value : undefined
  }
  const absoluteDates = (value: string) => [...new Set(value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])]
    .filter(date => Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date)
  const collectLinks = (root: Element) => {
    let scanned = 0
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (++scanned > 2000) break
      if (hidden(anchor) || anchor.closest('nav,header,footer,pre,code') || anchor.getAttribute('href')?.startsWith('#')) continue
      const title = clean(anchor.innerText).replace(/\s+/g, ' ')
      if (!title || title.length > 256) continue
      let url: URL
      try { url = new URL(anchor.href); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) continue } catch { continue }
      // Old news lists are often text + anchor + <br>, without li wrappers.
      // Stop at adjacent links/rows so one story cannot borrow another's date.
      const adjacent = (direction: 'previousSibling' | 'nextSibling') => {
        let node = anchor[direction], value = ''
        for (let n = 0; node && n < 6; node = node[direction], n++) {
          if (node.nodeType === 1 && /^(?:A|BR|LI|TR|DIV|P|UL|OL|TABLE|ARTICLE|SECTION|MAIN|NAV|HEADER|FOOTER|ASIDE|H[1-6])$/i.test((node as Element).tagName)) break
          if (node.nodeType === 1 && (node as Element).querySelector('a')) break
          value += ' ' + (localText(node) ?? '')
        }
        return value
      }
      let context = adjacent('previousSibling') + ' ' + adjacent('nextSibling')
      const row = anchor.closest('li,tr,p')
      if (row && [...row.querySelectorAll('a[href]')].filter(link => !hidden(link)).length === 1) context = localText(row) ?? ''
      if (!row) {
        let branch: Element = anchor
        for (let depth = 0; depth < 4 && branch.parentElement; depth++) {
          const card = branch.parentElement
          if (card.matches('body,html,main,nav,header,footer,aside,li,tr,p,ul,ol,table') || (card === root && !card.matches('article'))) break
          if (!card.matches('div,section,article')) { branch = card; continue }
          // A title wrapper may contain inline highlighting, never a nested
          // card or another heading. Do not climb out of an undated card to
          // borrow a page clock or the next story's metadata.
          if (branch.querySelector('div,section,article,li,tr,p,ul,ol,table,h1,h2,h3,h4,h5,h6')) break
          const ownTitle = localText(branch), value = localText(card)
          if (ownTitle?.replace(/\s+/g, '') !== title.replace(/\s+/g, '') || value === undefined) { context = ''; break }
          // Other semantic sections or headings describe independent content,
          // even when they contain no link. Ordinary div metadata is allowed.
          if ([...card.querySelectorAll('section,article,details,h1,h2,h3,h4,h5,h6')].some(node => node !== branch && !branch.contains(node))) { context = ''; break }
          const titleOnly = value.replace(/\s+/g, '') === title.replace(/\s+/g, '')
          if (titleOnly && !branch.matches('div,section,article,h1,h2,h3,h4,h5,h6')) { branch = card; continue }
          context = ''
          if ([...card.querySelectorAll('a[href]')].filter(link => !hidden(link)).length !== 1) break
          const dates = absoluteDates(value)
          if (dates.length !== 1) break
          // A standalone or explicitly labelled caption is an observed date.
          // A date quoted in a news excerpt, URL or relative-time label is not.
          const caption = /^(?:(?:发布时间|发布日期|Published(?:\s+on)?)\s*[:：]\s*)?\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/iu
          if ([...card.querySelectorAll('span,time,div')].some(node => !node.children.length && !branch.contains(node)
            && !node.closest('a,h1,h2,h3,h4,h5,h6,p,blockquote,nav,header,footer,aside,pre,code')
            && !hidden(node) && caption.test(clean(localText(node) ?? '')))) context = dates[0]!
          break
        }
      }
      const dates = absoluteDates(context)
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
    // Government publishers can use H2 for the primary article and H2 links
    // for recommendations. Require the explicit page ArticleTitle metadata to
    // agree with an unlinked visible heading; H2 alone is never a primary ID.
    if (!titles.length) {
      const metadataTitles = [...new Set([...document.querySelectorAll<HTMLMetaElement>('meta[name]')]
        .filter(meta => meta.name.toLowerCase() === 'articletitle')
        .map(meta => normalize(meta.content)).filter(value => value.length > 0 && value.length <= 256))]
      if (metadataTitles.length === 1 && [...document.querySelectorAll<HTMLElement>('h2')].some(el =>
        !el.closest('[hidden],[aria-hidden="true"],nav,footer,aside,a') && !el.querySelector('a') && normalize(el.innerText) === metadataTitles[0])) titles.push(metadataTitles[0]!)
    }
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
      if (['og:title','articletitle'].includes(key) && normalize(meta.content) !== title) return
      if (!['article:published_time','datepublished','publishdate','pubdate'].includes(key)) continue
      const value = date(meta.content); if (value) dates.add(value)
    }
    for (const time of document.querySelectorAll<HTMLTimeElement>('article time[itemprop="datePublished"],main time[itemprop="datePublished"],article time[pubdate]')) {
      const value = date(time.dateTime); if (value) dates.add(value)
    }
    // Legacy publishers often expose no Article JSON-LD or publication meta.
    // Read only explicitly labelled publication captions in small metadata
    // siblings immediately after the unique primary heading. Never scan the
    // whole page: its clock, recommended stories and quoted body dates belong
    // to other records. The CCTD news_show H1 + news_tool structure is one such
    // observed page; this does not depend on a publisher-specific class name.
    for (const heading of document.querySelectorAll<HTMLElement>('h1')) {
      if (heading.closest('[hidden],[aria-hidden="true"],nav,footer') || normalize(heading.innerText) !== title) continue
      let next = heading.nextElementSibling
      for (let n = 0; next && n < 3; n++, next = next.nextElementSibling) {
        if (next.matches('script,style,[hidden],[aria-hidden="true"]')) continue
        if (next.matches('article,main,section,p,pre,code,blockquote,aside,nav,footer') || next.querySelector('h1,h2,h3,article,main,section,p,blockquote')) break
        const caption = (next as HTMLElement).innerText ?? ''
        if (caption.length > 800) break
        const labels = [caption, ...[...next.querySelectorAll<HTMLElement>('li,span,time')].map(node => node.innerText)]
        for (const label of labels) for (const match of label.matchAll(/(?:^|[\r\n])\s*(?:发布时间|发布日期|Published(?:\s+on)?)\s*[:：]\s*(\d{4}-\d{2}-\d{2})(?=$|[T\s])/giu)) {
          const value = date(match[1]); if (value) dates.add(value)
        }
      }
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
