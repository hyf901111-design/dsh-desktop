import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {bookDataset,archiveView,scheduleView,priorityView} from './fixtures/book-workbench-dataset.js'
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})
async function open(view,{dataset=bookDataset(),saved,width=900,mode='openterminal',readOnly=false}={}){
 const page=await browser.newPage({viewport:{width,height:720}})
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'view',title:'演练组合组件',dataset,view})))
 const preview=buildResearchHtmlPreview(spec.html,spec.title,mode==='light'?'light':'dark',{workbench:true,notoFont:'runtime'})
 await page.setContent('<iframe id=preview style="width:100%;height:700px;border:0" sandbox="allow-scripts" srcdoc="'+preview.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></iframe>')
 const frame=page.frameLocator('#preview').frameLocator('iframe');await frame.locator('.dv-shell').waitFor()
 await page.evaluate(({saved,readOnly})=>{
  window.viewEvents=[];addEventListener('message',e=>{if(['sherlock-component-send','sherlock-content-failed'].includes(e.data?.type))window.viewEvents.push(e.data)})
  document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-component-context',shared:false,online:true,readOnly,userId:'local',...(saved?{saved}:{})},'*')
 },{saved,readOnly})
 await expect.poll(()=>frame.locator('html').evaluate(()=>window.sherlockShared.inspect()?.connected)).toBe(true)
 await frame.locator('html').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode)
 return {page,frame,close:()=>page.close(),saved:()=>page.evaluate(()=>window.viewEvents.filter(e=>e.message?.op==='localCommit').at(-1)?.message)}
}
const order=frame=>frame.locator('tbody tr:not([hidden])').evaluateAll(rows=>rows.map(r=>r.dataset.recordId))
it('filters and reorders visible records while keeping hidden identities and all source values intact',async()=>{
 const view=priorityView();view.sections[0].fields=view.sections[0].fields.filter(key=>key!=='id');
 const c=await open(view)
 try{
  expect(await c.frame.getByRole('button',{name:'查看B01完整详情',exact:true}).textContent()).toBe('B01')
  expect(await order(c.frame)).toEqual(['B01','B02','B03','B04','B05','B06','B07','B08'])
  await c.frame.getByRole('button',{name:'上移B03',exact:true}).click()
  expect(await order(c.frame)).toEqual(['B01','B03','B02','B04','B05','B06','B07','B08'])
  await c.frame.getByRole('button',{name:'下移B03',exact:true}).click()
  await c.frame.getByRole('combobox',{name:'负责人',exact:true}).selectOption({label:'修复师甲'})
  await c.frame.getByRole('button',{name:'上移B05',exact:true}).click()
  expect(await order(c.frame)).toEqual(['B01','B05','B03','B07'])
  const state=await c.frame.locator('html').evaluate(()=>window.sherlockShared.inspect().state)
  expect(state.order).toEqual(['B01','B02','B05','B04','B03','B06','B07','B08'])
  await c.frame.getByRole('button',{name:'查看B05完整详情',exact:true}).click()
  expect(await c.frame.locator('.dv-detail').textContent()).toContain('11.6 %')
  expect(await c.frame.locator('#dataset-view-source').evaluate(el=>JSON.parse(el.textContent).dataset)).toEqual(bookDataset())
  const saved=await c.saved();const reopened=await open(view,{saved})
  try{
   expect(await order(reopened.frame)).toEqual(['B01','B05','B03','B07'])
   expect(await reopened.frame.getByRole('combobox',{name:'负责人',exact:true}).inputValue()).toBe(JSON.stringify('修复师甲'))
   expect(await reopened.frame.locator('.dv-detail').textContent()).toContain('记录 B05')
  }finally{await reopened.close()}
  expect((await c.page.evaluate(()=>window.viewEvents)).some(e=>e.type==='sherlock-content-failed')).toBe(false)
 }finally{await c.close()}
},20000)
it('compares any two records from the same snapshot and restores filters, selectors and active view',async()=>{
 const c=await open(archiveView())
 try{
  await c.frame.getByRole('tab',{name:'两册对比',exact:true}).click()
  await c.frame.getByRole('combobox',{name:'对比记录2',exact:true}).selectOption('B08')
  expect(await c.frame.locator('.dv-compare-head').textContent()).toContain('B01')
  expect(await c.frame.locator('.dv-compare-head').textContent()).toContain('B08')
  const moisture=c.frame.locator('.dv-compare-row').filter({hasText:'复检含水率'})
  expect(await moisture.textContent()).toContain('10 %');expect(await moisture.textContent()).toContain('未提供')
  await c.frame.getByRole('combobox',{name:'负责人',exact:true}).selectOption({label:'修复师甲'})
  await c.frame.getByRole('combobox',{name:'对比记录1',exact:true}).selectOption('B05')
  await c.frame.getByRole('combobox',{name:'对比记录2',exact:true}).selectOption('B07')
  const reopened=await open(archiveView(),{saved:await c.saved(),width:400})
  try{
   expect(await reopened.frame.getByRole('tab',{name:'两册对比',exact:true}).getAttribute('aria-selected')).toBe('true')
   expect(await reopened.frame.getByRole('combobox',{name:'对比记录1',exact:true}).inputValue()).toBe('B05')
   expect(await reopened.frame.getByRole('combobox',{name:'对比记录2',exact:true}).inputValue()).toBe('B07')
   const row=reopened.frame.locator('.dv-compare-row').filter({hasText:'病害'})
   const label=await row.locator('.dv-compare-label').boundingBox(),a=await row.locator('.dv-compare-value').first().boundingBox(),b=await row.locator('.dv-compare-value').last().boundingBox()
   expect(a.x).toBeGreaterThanOrEqual(label.x+label.width-.5);expect(b.x).toBeGreaterThanOrEqual(a.x+a.width-.5)
  }finally{await reopened.close()}
 }finally{await c.close()}
},20000)
it('retains missing schedules and shows real conflicts without moving shared times or dropping records',async()=>{
 const dataset=bookDataset();dataset.records[1].start=dataset.records[0].start;dataset.records[1].end=dataset.records[0].end;dataset.records[7].start=null;dataset.records[7].end=null
 const c=await open(scheduleView(),{dataset})
 try{
  expect(await c.frame.locator('.dv-schedule-row').count()).toBe(8)
  expect(await c.frame.locator('.dv-schedule-row[data-conflict=true]').count()).toBe(2)
  expect(await c.frame.locator('.dv-schedule-row[data-record-id=B08]').textContent()).toContain('待排期')
  await c.frame.getByRole('button',{name:'查看B02排程',exact:true}).click()
  expect(await c.frame.locator('.dv-detail').textContent()).toContain(dataset.records[0].start)
  expect(await c.frame.locator('#dataset-view-source').evaluate(el=>JSON.parse(el.textContent).dataset)).toEqual(dataset)
 }finally{await c.close()}
},20000)
it('keeps schedule names and long owners inside natural-height controls in four real host themes',async()=>{
 const dataset=bookDataset();dataset.records[0].owner='修复师甲／负责清洁修补和含水率复检的值班负责人'.repeat(4)
 for(const mode of ['light','dark','openterminal','enterprise'])for(const width of [360,656,1280]){
  const c=await open(scheduleView(),{dataset,width,mode})
  try{
   const button=c.frame.getByRole('button',{name:'查看B01排程',exact:true}),box=await button.boundingBox(),owner=await button.locator('small').boundingBox()
   expect(owner.y+owner.height).toBeLessThanOrEqual(box.y+box.height+.5)
   expect(await button.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true)
  }finally{await c.close()}
 }
},30000)
it('keeps title, filters, table actions and selected detail separate at narrow and wide sizes',async()=>{
 for(const width of [360,656,1280]){
  const view={...priorityView(),subject:'古籍修复交接检查与验收的长标题，保持自然换行和完整信息'}
  const c=await open(view,{width})
  try{
   await c.frame.getByRole('button',{name:'查看B04完整详情',exact:true}).click()
   const heading=await c.frame.locator('.dv-heading').boundingBox(),tools=await c.frame.locator('.dv-toolbar').boundingBox(),table=await c.frame.locator('.dv-table-wrap').boundingBox(),detail=await c.frame.locator('.dv-detail').boundingBox()
   expect(tools.y).toBeGreaterThanOrEqual(heading.y+heading.height-.5);expect(table.y).toBeGreaterThanOrEqual(tools.y+tools.height-.5)
   if(width<1000)expect(detail.y).toBeGreaterThanOrEqual(table.y+table.height-.5);else expect(detail.x).toBeGreaterThanOrEqual(table.x+table.width-.5)
   const wrap=c.frame.locator('.dv-table-wrap');await wrap.evaluate(el=>el.scrollLeft=el.scrollWidth)
   const actions=await c.frame.getByRole('button',{name:'上移B04',exact:true}).boundingBox()
   expect(actions.x+actions.width).toBeLessThanOrEqual(table.x+table.width+1)
  }finally{await c.close()}
 }
},20000)
it('disables mutation controls in read-only contexts',async()=>{
 const c=await open(priorityView(),{readOnly:true})
 try{expect(await c.frame.getByRole('button',{name:'上移B02',exact:true}).isDisabled()).toBe(true);expect(await c.frame.getByRole('combobox',{name:'负责人',exact:true}).isDisabled()).toBe(true)}finally{await c.close()}
})

it('shows explicit gaps when all schedules are missing or a comparison has fewer than two filtered records',async()=>{
 const dataset=bookDataset();for(const r of dataset.records){r.start=null;r.end=null}dataset.records[0].stage='待处理'
 const schedule=await open(scheduleView(),{dataset})
 try{
  expect(await schedule.frame.locator('.dv-schedule-row').count()).toBe(8)
  expect(await schedule.frame.locator('.dv-bar').count()).toBe(0)
  expect(await schedule.frame.locator('[data-section-kind=schedule] .dv-meta').textContent()).toContain('未提供')
 }finally{await schedule.close()}
 const comparison=await open(archiveView(),{dataset})
 try{
  await comparison.frame.getByRole('combobox',{name:'阶段',exact:true}).selectOption({label:'待处理'})
  await comparison.frame.getByRole('tab',{name:'两册对比',exact:true}).click()
  expect(await comparison.frame.locator('.dv-compare-rows').textContent()).toContain('不足两条')
  expect(await comparison.frame.getByRole('combobox',{name:'对比记录2',exact:true}).isDisabled()).toBe(true)
  expect(await comparison.frame.locator('[data-view-count]').textContent()).toContain('1 / 8')
 }finally{await comparison.close()}
},20000)
