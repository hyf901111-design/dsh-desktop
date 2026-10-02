// Serialized into the webpage's isolated world; keep this function self-contained.
export function measureResearchWebLayout(win: Window = window) {
  let remaining = 400, constraints = 0
  const measure = (scope: Window, depth: number): number => {
    const doc = scope.document, width = scope.innerWidth, height = scope.innerHeight
    // Root scrollWidth also includes hidden menus and offscreen desktop widgets.
    // Only displayed panes below can request a wider viewport.
    let required = Math.max(width, doc.documentElement.clientWidth)
    // A desktop shell can hide overflow on an ancestor, so the root's scrollWidth
    // alone misses its minimum width. Respect deliberate table/carousel scrollports.
    const scrollport = (el: Element) => {
      for (let parent = el.parentElement; parent && parent !== doc.body && parent !== doc.documentElement; parent = parent.parentElement) {
        const style = scope.getComputedStyle(parent)
        if (/^(auto|scroll)$/.test(style.overflowX || style.overflow) && parent.scrollWidth > parent.clientWidth + 2) return true
      }
      return false
    }
    // Preview frames often follow hundreds of list rows. Inspect them first so
    // offscreen rows cannot consume the bounded measurement budget.
    const frames = Array.from(doc.querySelectorAll('iframe')).slice(0, 16)
    const panes = doc.querySelectorAll('body,main,section,article,aside,div,form,table')
    for (const el of [...frames, ...panes]) {
      if (remaining-- <= 0) break
      const rect = el.getBoundingClientRect(), style = scope.getComputedStyle(el)
      if (rect.width < 40 || rect.height < Math.min(80, height * .15) || rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width || style.visibility === 'hidden' || style.display === 'none' || scrollport(el)) continue
      const minimum = style.minWidth.endsWith('px') ? parseFloat(style.minWidth) : 0
      if (minimum > 0 || rect.right > width + 2 && rect.width >= width * .3) {
        const needed = Math.max(width + Math.max(0, minimum - rect.width), rect.right)
        if (needed > required + 2) { required = needed; constraints++ }
      }
      // Same-origin embedded documents (mail previews, dashboards) keep their
      // surrounding columns. Cross-origin frames remain behind the browser boundary.
      if (el.tagName === 'IFRAME' && depth < 2) {
        try {
          const child = (el as HTMLIFrameElement).contentDocument?.defaultView
          if (child && child.innerWidth > 0) {
            const needed = width + Math.max(0, measure(child, depth + 1) - child.innerWidth) * rect.width / child.innerWidth
            if (needed > required + 2) { required = needed; constraints++ }
          }
        } catch { /* The frame is cross origin or is navigating. */ }
      }
    }
    return Math.min(16384, required)
  }
  return { viewport: win.innerWidth, content: measure(win, 0), constraints }
}
