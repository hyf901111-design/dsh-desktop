// Column widths are local presentation preferences. Source cells and sort/filter
// controls stay owned by their renderer, including React and sandboxed HTML.
export function installWorkbenchTableColumns(root, options = {}) {
  const doc = root.ownerDocument, win = doc.defaultView, tables = new Map()
  let disposed = false, queued = false
  const valid = (value, count) => value && Array.isArray(value.widths) && value.widths.length === count && value.widths.every(n => Number.isFinite(n) && n >= 48 && n <= 1600) && Array.isArray(value.manual) && value.manual.length === count && value.manual.every(n => typeof n === 'boolean')
  // Keep this helper inside the installer: sandboxed HTML embeds its source.
  const alignment = (header, label, cells) => {
    const type = (header.getAttribute('data-column-type') || header.getAttribute('data-type') || '').toLowerCase()
    if (/^(number|numeric|integer|decimal|currency|percent|percentage)$/.test(type)) return 'right'
    if (/^(boolean|bool)$/.test(type)) return 'center'
    if (/^(string|text|date|datetime|time|code|identifier)$/.test(type)) return 'left'
    if (/代码|编号|名称|日期|时间|报告期|证券|公司|(?:^|\b)(?:id|code|symbol|ticker|name|date|time)(?:\b|$)/i.test(label)) return 'left'
    const numeric = header.getAttribute('data-numeric')
    if (numeric !== null) return numeric === 'true' ? 'right' : 'left'
    if (/价格|最新价|开盘|收盘|最高|最低|涨跌|成交|金额|数量|市值|收益|净值|占比|权重|比率|估值|市盈率|市净率|(?:^|\b)(?:price|volume|amount|value|change|ratio|percent)(?:\b|$)/i.test(label)) return 'right'
    const values = cells.map(cell => cell.textContent.trim()).filter(value => value && !/^(?:[-—–]+|N\/?A|null|暂无|缺失)$/i.test(value))
    if (values.length && values.every(value => /^[+\-−]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?(?:%|％|bps|[KMBT]|万|亿|兆|元|美元|港元|点|股|手|倍|户|次|个)?$/i.test(value.replace(/\s/g, '').replace(/^(?:[$¥￥€£]|USD|HKD|CNY)/i, '')))) return 'right'
    return 'left'
  }
  const configure = table => {
    const headers = [...(table.tHead?.querySelector('tr')?.cells || table.querySelector('tr')?.cells || [])]
    if (!headers.length || headers.length > 40 || headers.some(el => el.tagName !== 'TH' || el.colSpan !== 1) || table.querySelector('[colspan]:not([colspan="1"]),[rowspan]:not([rowspan="1"])')) return
    let control = tables.get(table)
    const labels = headers.map(el => el.querySelector('button[aria-label]')?.getAttribute('aria-label')?.replace(/^按(.+)排序$/, '$1') || el.textContent.trim() || el.getAttribute('data-column-label') || '')
    const sameLabels = control && JSON.stringify(control.labels) === JSON.stringify(labels)
    let previousState = null, previousGroups = []
    if (control && (!sameLabels || headers.some((header,i) => header !== control.headers[i]))) {
      if (sameLabels) { previousState = control.snapshot(); previousGroups = control.groups }
      control.dispose(); tables.delete(table); control = null
    }
    if (!control) {
      const owner = table.closest('[data-research-node-id]') || root
      const index = [...owner.querySelectorAll('table')].indexOf(table)
      let state = previousState, dragging = null, usedGroup = false, published = ''
      const currentGroups = [...table.querySelectorAll(':scope>colgroup')].filter(group => !group.hasAttribute('data-workbench-columns')).map(group => group.cloneNode(true))
      const originalGroups = currentGroups.length ? currentGroups : previousGroups
      let labelHash = 2166136261
      for (const char of JSON.stringify(labels)) labelHash = Math.imul(labelHash ^ char.charCodeAt(0), 16777619)
      const key = 'table-columns-' + index + '-' + (labelHash >>> 0).toString(36)
      const apply = () => {
        table.setAttribute('data-workbench-table-columns', '')
        const rows = [...table.rows]
        const alignments = headers.map((header, i) => {
          const cells = rows.filter(row => row.parentElement !== table.tHead).map(row => row.cells[i]).filter(Boolean)
          const align = alignment(header, labels[i], cells.slice(0, 100))
          const padding = cells[0] && win.getComputedStyle(cells[0])
          header.style.setProperty('--workbench-column-padding-left', padding?.paddingLeft || '8px')
          header.style.setProperty('--workbench-column-padding-right', padding?.paddingRight || '8px')
          header.style.setProperty('--workbench-column-justify', align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start')
          return align
        })
        if (state) {
          let group = table.querySelector('colgroup[data-workbench-columns]')
          if (!group) { table.querySelectorAll(':scope>colgroup').forEach(el => el.remove()); group = doc.createElement('colgroup'); group.setAttribute('data-workbench-columns', ''); table.prepend(group) }
          usedGroup = true
          while (group.children.length < headers.length) group.append(doc.createElement('col'))
          ;[...group.children].forEach((col, i) => col.style.setProperty('width', state.widths[i] + 'px', 'important'))
          table.style.setProperty('width', state.widths.reduce((a, b) => a + b, 0) + 'px', 'important')
          table.style.setProperty('min-width', '0', 'important')
          table.style.setProperty('table-layout', 'fixed', 'important')
        } else {
          table.querySelector('colgroup[data-workbench-columns]')?.remove()
          if (usedGroup) { for (const group of originalGroups) table.prepend(group.cloneNode(true)); usedGroup = false }
          for (const name of ['width', 'min-width', 'table-layout']) table.style.removeProperty(name)
        }
        for (const row of table.rows) [...row.cells].forEach((cell, i) => {
          cell.setAttribute('data-column-wrap', state?.manual[i] ? 'true' : 'false')
          cell.setAttribute('data-column-align', alignments[i])
        })
        table.setAttribute('data-workbench-view-key', key)
        table.setAttribute('data-workbench-chart-view', JSON.stringify(state || null))
        headers.forEach((header, i) => {
          header.setAttribute('data-column-label', labels[i])
          let handle = header.querySelector('[data-workbench-column-resize]')
          if (!handle) {
            handle = doc.createElement('span'); handle.setAttribute('data-workbench-column-resize', String(i))
            handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.tabIndex = 0
            header.append(handle)
          }
          handle.setAttribute('data-workbench-column-resize', String(i))
          handle.setAttribute('aria-label', '调整“' + labels[i] + '”列宽'); handle.title = '拖动调整列宽 · 双击恢复默认'
          handle.setAttribute('aria-valuemin', '48'); handle.setAttribute('aria-valuemax', '1600')
          handle.setAttribute('aria-valuenow', String(Math.round(state?.widths[i] || header.getBoundingClientRect().width || 80)))
        })
        const encoded = JSON.stringify(state)
        if (published !== encoded) { published = encoded; win.dispatchEvent(new win.Event('sherlock-presentation-change')) }
      }
      const save = () => { options.save?.(owner, index, labels, state); table.dispatchEvent(new win.Event('input', { bubbles: true })) }
      const widths = () => state?.widths.slice() || headers.map(el => Math.max(48, Math.min(1600, Math.round(el.getBoundingClientRect().width) || 80)))
      const resize = (i, width, current = widths()) => {
        state = { widths: current.slice(), manual: state?.manual.slice() || headers.map(() => false) }
        state.widths[i] = Math.max(48, Math.min(1600, Math.round(width))); state.manual[i] = true; apply()
      }
      const handleFor = event => event.target.closest?.('[data-workbench-column-resize]')
      const move = event => { if (!dragging || event.pointerId !== dragging.pointerId) return; resize(dragging.i, dragging.width + (event.clientX - dragging.x) / dragging.scale, dragging.widths); event.preventDefault() }
      const finish = event => { if (!dragging || event.pointerId !== dragging.pointerId) return; dragging.handle.releasePointerCapture?.(event.pointerId); dragging = null; doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', finish); doc.removeEventListener('pointercancel', finish); save() }
      const down = event => {
        const handle = handleFor(event); if (!handle || event.button !== 0) return
        event.preventDefault(); event.stopPropagation(); handle.focus({ preventScroll: true })
        const i = Number(handle.dataset.workbenchColumnResize), current = widths(), scale = table.offsetWidth > 0 ? table.getBoundingClientRect().width / table.offsetWidth : 1
        dragging = { i, x: event.clientX, width: current[i], widths: current, pointerId: event.pointerId, scale: scale > 0 ? scale : 1, handle }
        handle.setPointerCapture?.(event.pointerId); doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', finish); doc.addEventListener('pointercancel', finish)
      }
      const click = event => { if (handleFor(event)) { event.preventDefault(); event.stopPropagation() } }
      const reset = event => { if (!handleFor(event)) return; click(event); state = null; apply(); save() }
      const keyboard = event => { const handle = handleFor(event); if (!handle || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return; click(event); if (event.key === 'Home') reset(event); else { const i = Number(handle.dataset.workbenchColumnResize), current = widths(); resize(i, current[i] + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 50 : 10), current); save() } }
      const restore = event => { if (event.detail === null || valid(event.detail, headers.length)) { state = event.detail; apply() } }
      try { const saved = previousState || options.load?.(owner, index, labels); if (valid(saved, headers.length)) state = saved } catch {}
      table.addEventListener('pointerdown', down, true); table.addEventListener('click', click, true); table.addEventListener('dblclick', reset, true); table.addEventListener('keydown', keyboard, true); table.addEventListener('sherlock-chart-restore', restore)
      control = { labels, headers, groups:originalGroups, snapshot:()=>state, apply, dispose() { table.removeEventListener('pointerdown', down, true); table.removeEventListener('click', click, true); table.removeEventListener('dblclick', reset, true); table.removeEventListener('keydown', keyboard, true); table.removeEventListener('sherlock-chart-restore', restore); doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', finish); doc.removeEventListener('pointercancel', finish) } }
      tables.set(table, control)
    }
    control.apply()
  }
  const scan = () => { queued = false; if (disposed) return; for (const [table, control] of tables) if (!root.contains(table)) { control.dispose(); tables.delete(table) } for (const table of root.querySelectorAll('table')) configure(table) }
  const observer = new win.MutationObserver(records => {
    const changed = records.some(record => record.type === 'childList' || record.type === 'characterData' && record.target.parentElement?.closest('th') || record.type === 'attributes' && record.target.tagName === 'BUTTON' && record.target.closest('th'))
    if (changed && !queued && !disposed) { queued = true; win.queueMicrotask(scan) }
  })
  observer.observe(root, { childList: true, characterData: true, attributes:true, attributeFilter:['aria-label'], subtree: true }); scan()
  return () => { disposed = true; observer.disconnect(); for (const control of tables.values()) control.dispose(); tables.clear() }
}

export function createWorkbenchTableColumnState(storage, sessionId) {
  const key = (id, index, labels) => {
    let hash = 2166136261
    for (const char of JSON.stringify(labels)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
    return 'ework.research.table-columns.v1:' + sessionId + ':' + id + ':' + index + ':' + (hash >>> 0).toString(36)
  }
  return {
    get(id, index, labels) { try { return JSON.parse(storage.getItem(key(id, index, labels)) || 'null') } catch { return null } },
    set(id, index, labels, state) { try { storage.setItem(key(id, index, labels), JSON.stringify(state)) } catch {} }
  }
}

export const WORKBENCH_TABLE_COLUMNS_CSS = `
body table[data-workbench-table-columns]{min-width:max-content!important;max-width:none!important;table-layout:auto!important}
body table[data-workbench-table-columns] :is(th,td){white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important;max-width:none!important}
body table[data-workbench-table-columns] :is(th,td)[data-column-wrap="true"]{white-space:normal!important;overflow-wrap:anywhere!important}
body table[data-workbench-table-columns] :is(th,td)[data-column-align="left"]{text-align:left!important}
body table[data-workbench-table-columns] :is(th,td)[data-column-align="right"]{text-align:right!important;font-variant-numeric:tabular-nums}
body table[data-workbench-table-columns] :is(th,td)[data-column-align="center"]{text-align:center!important}
body table[data-workbench-table-columns] th{position:sticky!important;top:0;height:26px!important;font-size:12px!important;line-height:18px!important;padding-top:4px!important;padding-bottom:4px!important;padding-left:var(--workbench-column-padding-left,8px)!important;padding-right:var(--workbench-column-padding-right,8px)!important}
body table[data-workbench-table-columns] th button{white-space:inherit!important;overflow-wrap:inherit!important;text-align:inherit!important;justify-content:var(--workbench-column-justify,flex-start)!important;box-sizing:border-box;width:100%;height:auto!important;min-height:0!important;line-height:18px!important;padding:0!important}
/* Follow the renderer's actual sort state; do not add pretend sorting to plain
   data headers, or write arrow characters into labels used for width identity. */
body table[data-workbench-table-columns] th:is([aria-sort],:has(>button[data-column]),:has(>button[aria-label*="排序"]),:has(>button[aria-label^="Sort "]))>button::after{content:"↕";display:inline-block;width:10px;margin-left:4px;font:12px/18px system-ui,sans-serif;color:inherit;opacity:.55}
body table[data-workbench-table-columns] th[aria-sort="ascending"]>button::after{content:"↑"!important;opacity:1!important}
body table[data-workbench-table-columns] th[aria-sort="descending"]>button::after{content:"↓"!important;opacity:1!important}
body [data-workbench-column-resize]{position:absolute;inset:0 0 0 auto;width:8px;cursor:col-resize;touch-action:none;user-select:none;z-index:3;background:transparent!important}
body [data-workbench-column-resize]::after{content:"";position:absolute;inset:5px 0 5px auto;width:1px;background:currentColor;opacity:.25}
body [data-workbench-column-resize]:is(:hover,:focus-visible)::after{width:2px;background:var(--sherlock-control-primary,#168cf0);opacity:1}
body [data-workbench-column-resize]:focus-visible{outline:1px solid var(--sherlock-control-primary,#168cf0);outline-offset:-1px}
`
