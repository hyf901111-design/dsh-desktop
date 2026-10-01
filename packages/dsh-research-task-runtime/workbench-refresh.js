// Presentation-only state. It never executes source requests or writes canvas
// geometry. Shared journals remain responsible for business interactions.
export function createWorkbenchRefreshSurface(root, onState = () => {}) {
  const doc = root.ownerDocument, win = doc.defaultView
  let applying = false, disposed = false, timer = 0, cleanupTimer = 0
  const route = el => { const path = []; while (el && el !== root) { const p = el.parentElement; if (!p) return null; path.unshift([...p.children].indexOf(el)); el = p } return path }
  const resolve = path => Array.isArray(path) && path.length < 40 ? path.reduce((el, index) => Number.isInteger(index) && index >= 0 && index < 10000 ? el?.children[index] : null, root) : null
  const entries = () => {
    const out = new Map()
    for (const el of root.querySelectorAll('td,strong,[data-refresh-key],.metric-value,.market-metric-value,.research-metric-value,.fund-value')) {
      if (out.size >= 5000 || el.closest('button,input,select,textarea,[role=status],.asof,.source,.market-asof')) continue
      const text = el.getAttribute('data-refresh-value') || el.textContent.trim()
      if (!text || text.length > 512 || !/[0-9]/.test(text) || el.children.length && el.tagName.toLowerCase() !== 'td') continue
      let key = el.getAttribute('data-refresh-key')
      if (!key && el.tagName.toLowerCase() === 'td') {
        const row = el.closest('tr'), table = el.closest('table'), col = [...row.children].indexOf(el)
        key = 'table:' + JSON.stringify(route(table)) + ':' + row.children[0]?.textContent.trim() + ':' + col
      }
      if (!key) { const label = el.parentElement?.querySelector('label,dt,.label,.metric-label,.market-label,.research-metric-label,.fund-label'); const section = el.closest('[data-refresh-series],section'); key = label ? 'metric:' + (section?.getAttribute('data-refresh-series') || section?.querySelector('h1,h2,h3')?.textContent.trim() || '') + ':' + label.textContent.trim() : JSON.stringify(route(el)) }
      out.set(key, { element: el, value: text })
    }
    return out
  }
  const snapshot = () => {
    const controls = [], scroll = []
    for (const el of root.querySelectorAll('input,select,textarea,details')) {
      if (controls.length >= 200 || el.type === 'password' || el.type === 'file') continue
      controls.push({ path: route(el), tag: el.tagName, ...(el.tagName === 'DETAILS' ? { open: el.open } : { value: String(el.value).slice(0, 8192), checked: Boolean(el.checked) }) })
    }
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (scroll.length >= 200) break
      if (el.scrollTop || el.scrollLeft) scroll.push({ path: route(el), x: el.scrollLeft, y: el.scrollTop })
    }
    const values = [...entries()].map(([key, entry]) => [key, entry.value])
    for (const el of root.querySelectorAll('[data-workbench-chart-view]')) { if (values.length >= 5000) break; const value = el.getAttribute('data-workbench-chart-view'),key=el.getAttribute('data-workbench-view-key'); if (value?.length <= (key==='technical-controls'?65536:512)) values.push([key&&key.length<=120?'chart-view-key:'+key:'chart-view:' + JSON.stringify(route(el)), value]) }
    return { values, controls, scroll }
  }
  const publish = () => { timer = 0; if (!disposed && !applying) onState(snapshot()) }
  const schedule = () => { if (!applying && !disposed) { clearTimeout(timer); timer = setTimeout(publish, 60) } }
  const apply = (state, animate = false) => {
    if (!state || disposed) return
    applying = true
    // The journal restores filters/sort/ranges before this view restoration.
    for (const control of state.controls || []) {
      const el = resolve(control.path)
      if (!el || el.tagName !== control.tag) continue
      if (el.tagName === 'DETAILS') el.open = control.open === true
      else if (typeof control.value === 'string' && el.type !== 'password' && el.type !== 'file' && el.value !== control.value) {
        el.value = control.value; if ('checked' in el) el.checked = control.checked === true
        el.dispatchEvent(new win.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
      }
    }
    for (const [key, value] of state.values || []) if (key.startsWith('chart-view:')||key.startsWith('chart-view-key:')) {
      try { const el = key.startsWith('chart-view-key:')?[...root.querySelectorAll('[data-workbench-view-key]')].find(el=>el.getAttribute('data-workbench-view-key')===key.slice(15)):resolve(JSON.parse(key.slice(11))), view = JSON.parse(value); if (el?.hasAttribute('data-workbench-chart-view')) el.dispatchEvent(new win.CustomEvent('sherlock-chart-restore', { detail: view })) } catch {}
    }
    for (const item of state.scroll || []) { const el = resolve(item.path); if (el && Number.isFinite(item.x) && Number.isFinite(item.y)) { el.scrollLeft = Math.max(0, Math.min(12000, item.x)); el.scrollTop = Math.max(0, Math.min(12000, item.y)) } }
    if (animate && state.values?.length) {
      clearTimeout(cleanupTimer)
      root.querySelectorAll('[data-workbench-value-changed]').forEach(el => el.removeAttribute('data-workbench-value-changed'))
      const previous = new Map(state.values)
      for (const [key, entry] of entries()) if (!previous.has(key) || previous.get(key) !== entry.value) entry.element.setAttribute('data-workbench-value-changed', '')
      cleanupTimer = setTimeout(() => root.querySelectorAll('[data-workbench-value-changed]').forEach(el => el.removeAttribute('data-workbench-value-changed')), 1200)
    }
    applying = false; publish()
  }
  for (const event of ['input','change','click','scroll']) root.addEventListener(event, schedule, true)
  return { snapshot, apply, dispose() { disposed = true; clearTimeout(timer); clearTimeout(cleanupTimer); for (const event of ['input','change','click','scroll']) root.removeEventListener(event, schedule, true) } }
}

export const workbenchRefreshCss = `
[data-workbench-value-changed]{animation:ework-value-arrival 200ms ease-out,ework-value-highlight 1200ms ease-out;background-color:rgba(45,153,255,.13)}
svg [data-workbench-value-changed]{filter:drop-shadow(0 0 3px rgba(45,153,255,.6));background:none}
@keyframes ework-value-arrival{from{opacity:.5}to{opacity:1}}
@keyframes ework-value-highlight{0%,75%{background-color:rgba(45,153,255,.13)}100%{background-color:transparent}}
@media(prefers-reduced-motion:reduce){[data-workbench-value-changed]{animation:none}svg [data-workbench-value-changed]{filter:none}}
`

export function isWorkbenchViewState(state) {
  const path = value => Array.isArray(value) && value.length < 40 && value.every(n => Number.isInteger(n) && n >= 0 && n < 10000)
  try { return Boolean(state && Object.keys(state).length === 3 && Array.isArray(state.values) && state.values.length <= 5000 && state.values.every(row => Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && row[0].length <= 512 && typeof row[1] === 'string' && row[1].length <= (row[0]==='chart-view-key:technical-controls'?65536:512)) && Array.isArray(state.controls) && state.controls.length <= 200 && state.controls.every(c => c && path(c.path) && ['INPUT','SELECT','TEXTAREA','DETAILS'].includes(c.tag) && (c.tag === 'DETAILS' ? typeof c.open === 'boolean' : typeof c.value === 'string' && c.value.length <= 8192 && typeof c.checked === 'boolean')) && Array.isArray(state.scroll) && state.scroll.length <= 200 && state.scroll.every(s => s && path(s.path) && [s.x,s.y].every(n => Number.isFinite(n) && n >= 0 && n <= 12000)) && JSON.stringify(state).length <= 256000) } catch { return false }
}

export function workbenchContentRevision(html) {
  let hash = 2166136261
  for (let i = 0; i < html.length; i++) hash = Math.imul(hash ^ html.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(36) + '-' + html.length
}

export function workbenchTemplateIdentity(html) {
  const encoded = html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
  if (encoded && encoded.length < 512000) {
    try { const model = JSON.parse(encoded); if (typeof model.templateId === 'string' && typeof model.version === 'string') return 'template:' + model.templateId + ':' + model.version } catch {}
  }
  return workbenchContentRevision(html)
}

export function installWorkbenchRefresh(createSurface, valid, revision) {
  const start = () => {
    const surface = createSurface(document.body, state => parent.postMessage({ type: 'sherlock-workbench-view', state, revision }, '*'))
    let token = 0, interaction = 0
    // Journal replay restores existing decisions; it is not a newer edit made
    // while this document is loading. Keep its filter/sort and the saved scroll.
    const touched = () => { if(!document.documentElement.hasAttribute('data-sherlock-interaction-replaying'))interaction++ }
    for (const name of ['input','change','toggle','scroll']) document.body.addEventListener(name,touched,true)
    addEventListener('message', event => {
      const data = event.data
      if (event.source !== parent || data?.type !== 'sherlock-workbench-restore' || Object.keys(data).length !== 4 || data.revision !== revision || typeof data.animate !== 'boolean' || !valid(data.state)) return
      const request = ++token, requestedInteraction = interaction
      // Await the synchronous journal replay and chart draw, then restore scroll.
      setTimeout(() => {
        if (request !== token) return
        const latest=interaction!==requestedInteraction?surface.snapshot():null
        surface.apply(latest?{...data.state,controls:latest.controls,scroll:latest.scroll}:data.state,data.animate)
      }, 80)
    })
    parent.postMessage({ type: 'sherlock-workbench-ready', state: surface.snapshot(), revision }, '*')
    addEventListener('pagehide', () => { surface.dispose();for(const name of ['input','change','toggle','scroll'])document.body.removeEventListener(name,touched,true) }, { once: true })
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start()
}
