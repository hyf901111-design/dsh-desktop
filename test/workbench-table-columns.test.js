import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { installWorkbenchTableColumns, createWorkbenchTableColumnState, WORKBENCH_TABLE_COLUMNS_CSS } from '../packages/dsh-research-task-runtime/workbench-table-columns.js'
import { createWorkbenchRefreshSurface } from '../packages/dsh-research-task-runtime/workbench-refresh.js'

function fixture() {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<div data-research-node-id="own-table"><div style="overflow:auto"><table><thead><tr><th><button aria-label="按名称排序">名称</button></th><th><button aria-label="按日期排序">日期</button></th><th>完整说明</th></tr></thead><tbody><tr><td>迈瑞医疗</td><td>2026-02-03</td><td>完整保留零、负数和说明，不裁切数据</td></tr></tbody></table></div></div>'
  const table = doc.querySelector('table'), original = [...table.rows].map(row => [...row.cells].map(cell => cell.textContent))
  for (const header of table.tHead.querySelector('tr').cells) header.getBoundingClientRect = () => ({ width: 120 })
  return { win, doc, table, original }
}

it('all headers and source cells default to one line; dragging one column allows only that column to wrap', async () => {
  const f = fixture(), saved = vi.fn(), sort = vi.fn(), stop = installWorkbenchTableColumns(f.doc.body, { save: saved })
  f.table.querySelector('button').addEventListener('click', sort)
  try {
    expect([...f.table.querySelectorAll('th,td')].every(cell => cell.dataset.columnWrap === 'false')).toBe(true)
    expect(WORKBENCH_TABLE_COLUMNS_CSS).toContain('min-width:max-content!important')
    const handle = f.table.querySelector('[data-workbench-column-resize="0"]')
    handle.dispatchEvent(new f.win.PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 120, pointerId: 7 }))
    f.doc.dispatchEvent(new f.win.PointerEvent('pointermove', { bubbles: true, clientX: 70, pointerId: 7 }))
    f.doc.dispatchEvent(new f.win.PointerEvent('pointerup', { bubbles: true, pointerId: 7 }))
    expect(f.table.style.width).toBe('310px')
    expect(saved).toHaveBeenLastCalledWith(expect.anything(), 0, ['名称', '日期', '完整说明'], { widths: [70, 120, 120], manual: [true, false, false] })
    expect(f.table.rows[1].cells[0].dataset.columnWrap).toBe('true')
    expect(f.table.rows[1].cells[1].dataset.columnWrap).toBe('false')
    handle.dispatchEvent(new f.win.MouseEvent('click', { bubbles: true })); expect(sort).not.toHaveBeenCalled()
    f.table.querySelector('button').click(); expect(sort).toHaveBeenCalledTimes(1)
    f.table.tBodies[0].innerHTML = '<tr><td>药明康德</td><td>2026-02-04</td><td>搜索后保留列宽</td></tr>'
    await vi.waitFor(() => expect(f.table.rows[1].cells[0].dataset.columnWrap).toBe('true'))
    expect(f.table.style.width).toBe('310px')
    handle.dispatchEvent(new f.win.MouseEvent('dblclick', { bubbles: true }))
    expect(f.table.style.width).toBe(''); expect(f.table.rows[1].cells[0].dataset.columnWrap).toBe('false')
    expect(saved.mock.calls.at(-1)[3]).toBe(null)
  } finally { stop(); await f.win.happyDOM.close() }
})

it('restores widths across board reloads and the HTML refresh view bridge without writing source cells', async () => {
  const storage = new Map(), adapter = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  const state = createWorkbenchTableColumnState(adapter, 'own-board'), f = fixture()
  const callbacks = { load: (owner, index, labels) => state.get(owner.dataset.researchNodeId, index, labels), save: (owner, index, labels, value) => state.set(owner.dataset.researchNodeId, index, labels, value) }
  let stop = installWorkbenchTableColumns(f.doc.body, callbacks)
  const view = createWorkbenchRefreshSurface(f.doc.body)
  try {
    const handle = f.table.querySelector('[data-workbench-column-resize="1"]')
    handle.dispatchEvent(new f.win.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
    const snapshot = view.snapshot(); stop(); stop = installWorkbenchTableColumns(f.doc.body, callbacks)
    expect(f.table.querySelector('[data-workbench-column-resize="1"]').getAttribute('aria-valuenow')).toBe('130')
    f.table.querySelector('[data-workbench-column-resize="1"]').dispatchEvent(new f.win.KeyboardEvent('keydown', { bubbles: true, key: 'Home' }))
    view.apply(snapshot)
    expect(f.table.style.width).toBe('370px')
    expect([...f.table.rows].map(row => [...row.cells].map(cell => cell.querySelector('button')?.textContent || cell.textContent))).toEqual(f.original)
    expect(state.get('another-table', 0, ['名称', '日期', '完整说明'])).toBe(null)
    expect(state.get('own-table', 0, ['改变后的列'])).toBe(null)
  } finally { view.dispose(); stop(); await f.win.happyDOM.close() }
})

it('skips merged headers so column handles cannot misalign grouped data', async () => {
  const f = fixture(); f.table.tHead.querySelector('tr').cells[0].colSpan = 2
  const stop = installWorkbenchTableColumns(f.doc.body)
  try { expect(f.table.querySelector('[role=separator]')).toBe(null) } finally { stop(); await f.win.happyDOM.close() }
})
