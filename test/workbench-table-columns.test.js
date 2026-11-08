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

it('aligns headers and contents by column type, including numeric text, identifiers, dates, and missing values', async () => {
  const f=fixture()
  f.doc.head.innerHTML='<style>th{padding:4px 16px;text-align:left}td{padding:4px 8px}th button{text-align:center;padding:0 6px}'+WORKBENCH_TABLE_COLUMNS_CSS+'</style>'
  f.table.innerHTML='<thead><tr><th>代码</th><th>日期</th><th><button>最新价（元）</button></th><th data-numeric="true">涨跌幅（%）</th><th data-column-type="boolean">启用</th><th>名称</th></tr></thead><tbody><tr><td>000538</td><td>2026-09-25</td><td>49.87</td><td>-0.89%</td><td>是</td><td>云南白药</td></tr><tr><td>600276</td><td>2026-09-26</td><td>—</td><td>0</td><td>否</td><td>恒瑞医药</td></tr></tbody>'
  const stop=installWorkbenchTableColumns(f.doc.body)
  try {
    expect([...f.table.rows[0].cells].map(cell=>cell.dataset.columnAlign)).toEqual(['left','left','right','right','center','left'])
    for(const row of [...f.table.rows].slice(1))expect([...row.cells].map(cell=>cell.dataset.columnAlign)).toEqual(['left','left','right','right','center','left'])
    const th=f.table.rows[0].cells[2],td=f.table.rows[1].cells[2],style=element=>f.win.getComputedStyle(element)
    expect(style(th).textAlign).toBe('right');expect(style(td).textAlign).toBe('right')
    expect(style(th).paddingRight).toBe(style(td).paddingRight)
    expect(style(th.querySelector('button')).paddingRight).toBe('0px')
    f.table.tBodies[0].innerHTML='<tr><td>300760</td><td>2026-09-27</td><td>1,234.50</td><td>+1.20%</td><td>是</td><td>迈瑞医疗</td></tr>'
    await vi.waitFor(()=>expect(f.table.rows[1].cells[2].dataset.columnAlign).toBe('right'))
  } finally {stop();await f.win.happyDOM.close()}
})

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

it('uses live retained-header labels after regeneration and restores manual widths only for the same column identity',async()=>{
 const f=fixture(),storage=new Map(),state=createWorkbenchTableColumnState({getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},'board')
 const saved=vi.fn((owner,index,labels,value)=>state.set(owner.dataset.researchNodeId,index,labels,value))
 const stop=installWorkbenchTableColumns(f.doc.body,{load:(owner,index,labels)=>state.get(owner.dataset.researchNodeId,index,labels),save:saved})
 const oldLabels=['名称','日期','完整说明'],newLabels=['公司（代码）','最新报告期（披露日）','完整说明']
 try{
  const headers=[...f.table.tHead.querySelector('tr').cells],oldHandles=headers.map(header=>header.querySelector('[role=separator]'))
  oldHandles[0].dispatchEvent(new f.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}))
  expect(f.table.style.width).toBe('370px')
  // React keeps the TH and its imperative data attributes while updating the
  // sort button. Those cached attributes must not override the new renderer.
  headers[0].querySelector('button').firstChild.nodeValue=newLabels[0];headers[0].querySelector('button').setAttribute('aria-label','按'+newLabels[0]+'排序')
  headers[1].querySelector('button').firstChild.nodeValue=newLabels[1];headers[1].querySelector('button').setAttribute('aria-label','按'+newLabels[1]+'排序')
  await vi.waitFor(()=>expect(headers.map(header=>header.querySelector('[role=separator]').getAttribute('aria-label'))).toEqual(newLabels.map(label=>'调整“'+label+'”列宽')))
  expect(headers.map(header=>header.dataset.columnLabel)).toEqual(newLabels)
  expect(f.table.style.width).toBe('')
  oldHandles[1].dispatchEvent(new f.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}))
  expect(saved.mock.calls.at(-1)[2]).toEqual(newLabels)
  expect(saved.mock.calls.at(-1)[3].widths).toEqual([120,130,120])
  expect(state.get('own-table',0,oldLabels).widths).toEqual([130,120,120])
  f.table.tBodies[0].querySelector('tr').cells[0].textContent='刷新后的公司'
  await vi.waitFor(()=>expect(f.table.rows[1].cells[1].dataset.columnWrap).toBe('true'))
  expect(f.table.style.width).toBe('370px')
 }finally{stop();await f.win.happyDOM.close()}
})

it('does not restore a saved presentation onto a different same-count set of columns',async()=>{
 const f=fixture();let stop=installWorkbenchTableColumns(f.doc.body)
 const view=createWorkbenchRefreshSurface(f.doc.body)
 try{
  f.table.querySelector('[role=separator]').dispatchEvent(new f.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}))
  const previous=view.snapshot()
  stop()
  const head=f.table.tHead.querySelector('tr')
  head.innerHTML='<th>证券代码</th><th>报告期</th><th>经营数据</th>'
  stop=installWorkbenchTableColumns(f.doc.body)
  expect(f.table.style.width).toBe('')
  view.apply(previous)
  expect(f.table.style.width).toBe('')
  expect([...head.cells].every(cell=>cell.dataset.columnWrap==='false')).toBe(true)
 }finally{view.dispose();stop();await f.win.happyDOM.close()}
})

it('keeps the current manual widths when a renderer replaces header elements without changing their labels',async()=>{
 const f=fixture(),stop=installWorkbenchTableColumns(f.doc.body)
 try{
  f.table.querySelector('[role=separator]').dispatchEvent(new f.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}))
  const head=f.table.tHead.querySelector('tr'),old=head.cells[0],replacement=f.doc.createElement('th')
  replacement.innerHTML='<button aria-label="按名称排序">名称</button>'
  head.replaceChild(replacement,old)
  await vi.waitFor(()=>expect(replacement.querySelector('[role=separator]')).not.toBeNull())
  expect(replacement.querySelector('[role=separator]').getAttribute('aria-valuenow')).toBe('130')
  expect(f.table.style.width).toBe('370px')
 }finally{stop();await f.win.happyDOM.close()}
})

it('refreshes separator indices when existing headers move and reads changed plain HTML header text',async()=>{
 const f=fixture(),saved=vi.fn(),stop=installWorkbenchTableColumns(f.doc.body,{save:saved})
 try{
  const row=f.table.tHead.querySelector('tr'),first=row.cells[0],second=row.cells[1]
  row.insertBefore(second,first)
  await vi.waitFor(()=>expect(second.querySelector('[role=separator]').dataset.workbenchColumnResize).toBe('0'))
  expect(first.querySelector('[role=separator]').dataset.workbenchColumnResize).toBe('1')
  second.querySelector('[role=separator]').dispatchEvent(new f.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}))
  expect(saved.mock.calls.at(-1)[2]).toEqual(['日期','名称','完整说明'])
  expect(saved.mock.calls.at(-1)[3].widths).toEqual([130,120,120])
  row.cells[2].textContent='经营披露与来源'
  await vi.waitFor(()=>expect(row.cells[2].querySelector('[role=separator]').getAttribute('aria-label')).toBe('调整“经营披露与来源”列宽'))
 }finally{stop();await f.win.happyDOM.close()}
})

it('fits long prose to the available component width and wraps without truncating text or overriding manual widths',async()=>{
 const f=fixture(),original='完整正文与来源 https://example.com/a?long=value '+ '需要完整保留的说明。'.repeat(60)
 f.table.rows[1].cells[2].textContent=original
 let available=760;Object.defineProperty(f.table.parentElement,'clientWidth',{get:()=>available})
 const stop=installWorkbenchTableColumns(f.doc.body)
 try{
  expect(parseFloat(f.table.style.width)).toBeCloseTo(760)
  expect(f.table.rows[1].cells[2].dataset.columnWrap).toBe('true')
  expect(f.table.rows[1].cells[0].dataset.columnWrap).toBe('false')
  expect(f.table.rows[1].cells[2].textContent).toBe(original)
  const handle=f.table.querySelector('[data-workbench-column-resize="2"]'),before=parseFloat(f.table.style.width)
  handle.dispatchEvent(new f.win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowLeft'}))
  expect(parseFloat(f.table.style.width)).toBeCloseTo(before-10,0)
  available=1000;f.table.tBodies[0].append(f.doc.createElement('tr'))
  await vi.waitFor(()=>expect(parseFloat(f.table.style.width)).toBeCloseTo(before-10,0))
  handle.dispatchEvent(new f.win.KeyboardEvent('keydown',{bubbles:true,key:'Home'}))
  expect(parseFloat(f.table.style.width)).toBeCloseTo(1000)
  expect(f.table.rows[1].cells[2].textContent).toBe(original)
 }finally{stop();await f.win.happyDOM.close()}
})
