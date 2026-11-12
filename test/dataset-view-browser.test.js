import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {installWorkbenchScrollbars,isWorkbenchScrollbarMessage} from '../packages/dsh-research-task-runtime/workbench-scrollbars.js'
import {bookDataset,archiveView,scheduleView,priorityView} from './fixtures/book-workbench-dataset.js'
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})
async function open(view,{dataset=bookDataset(),context,saved,width=900,mode='openterminal',readOnly=false}={}){
 const page=await browser.newPage({viewport:{width,height:720}})
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'view',title:'演练组合组件',dataset,view,...(context?{context}:{})})))
 const preview=buildResearchHtmlPreview(spec.html,spec.title,mode==='light'?'light':'dark',{workbench:true,notoFont:'runtime'})
 await page.setContent('<iframe id=preview style="width:100%;height:700px;border:0" sandbox="allow-scripts" srcdoc="'+preview.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></iframe>')
 const frame=page.frameLocator('#preview').frameLocator('iframe');await frame.locator('.dv-shell').waitFor()
 await page.evaluate(({saved,readOnly})=>{
  window.viewEvents=[];addEventListener('message',e=>{if(['sherlock-component-send','sherlock-content-failed'].includes(e.data?.type))window.viewEvents.push(e.data)})
  document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-component-context',shared:false,online:true,readOnly,userId:'local',...(saved?{saved}:{})},'*')
 },{saved,readOnly})
 await expect.poll(()=>frame.locator('html').evaluate(()=>window.sherlockShared.inspect()?.connected)).toBe(true)
 await frame.locator('html').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode)
 return {page,frame,close:()=>page.close(),saved:async()=>{const revision=await frame.locator('html').evaluate(()=>window.sherlockShared.inspect().revision);await expect.poll(()=>page.evaluate(()=>window.viewEvents.filter(e=>e.message?.op==='localCommit').at(-1)?.message?.revision)).toBe(revision);return page.evaluate(()=>window.viewEvents.filter(e=>e.message?.op==='localCommit').at(-1)?.message)}}
}
const order=frame=>frame.locator('tbody tr:not([hidden])').evaluateAll(rows=>rows.map(r=>r.dataset.recordId))
it('shows strict numeric exceptions and excludes equal or unknown amounts in the client renderer',async()=>{
 const dataset={id:'amounts',label:'对账记录',asOf:'2026-11-12',note:'模拟原表',fields:[{key:'id',label:'编号'},{key:'delta',label:'差额',unit:'万元'}],records:[
  {id:'A1',delta:-2},{id:'A2',delta:0},{id:'A3',delta:3},{id:'A4',delta:null}
 ]};
 for(const [op,ids] of [['gt',['A3']],['ne',['A1','A3']]]){
  const c=await open({dataset:'amounts',where:[{field:'delta',op,value:0}],sections:[{kind:'records',fields:['id','delta']}]},{dataset});
  try{
   await expect.poll(()=>order(c.frame)).toEqual(ids);
   expect(await c.frame.locator('[data-view-count]').textContent()).toBe(`显示 ${ids.length} / 4 条记录`);
   expect(await c.frame.locator('#dataset-view-source').evaluate(el=>JSON.parse(el.textContent).dataset.records)).toEqual(dataset.records);
  }finally{await c.close();}
 }
});
it('uses Chinese field references in real host filters while preserving plain scenario notes safely',async()=>{
 const dataset=bookDataset();dataset.fields.find(f=>f.key==='owner').key='负责人';for(const r of dataset.records){r['负责人']=r.owner;delete r.owner;}
 const c=await open({dataset:dataset.id,filters:['负责人'],details:['负责人'],sections:[{kind:'records',fields:['负责人']}]},{dataset,width:400,context:'演练说明：<script>window.unsafeContext=true</script>三日窗口不延长。'})
 try{await c.frame.getByRole('combobox',{name:'负责人',exact:true}).selectOption({label:'修复师甲'});expect(await order(c.frame)).toEqual(['B01','B03','B05','B07']);await c.frame.getByRole('button',{name:'查看B01完整详情',exact:true}).click();expect(await c.frame.locator('.dv-detail').textContent()).toContain('修复师甲');expect(await c.frame.locator('[data-view-context]').textContent()).toContain('<script>window.unsafeContext=true</script>');expect(await c.frame.locator('html').evaluate(()=>window.unsafeContext)).toBeUndefined();}finally{await c.close()}
})
it('filters and reorders visible records while keeping hidden identities and all source values intact',async()=>{
 const view=priorityView();view.sections[0].fields=view.sections[0].fields.filter(key=>key!=='id');
 view.sections.push(scheduleView().sections[0])
 const c=await open(view)
 try{
  expect(await c.frame.getByRole('button',{name:'查看B01完整详情',exact:true}).textContent()).toBe('B01')
  expect(await order(c.frame)).toEqual(['B01','B02','B03','B04','B05','B06','B07','B08'])
  await c.frame.getByRole('button',{name:'上移B03',exact:true}).click()
  expect(await order(c.frame)).toEqual(['B01','B03','B02','B04','B05','B06','B07','B08'])
  expect(await c.frame.locator('.dv-schedule-row').evaluateAll(rows=>rows.map(row=>row.dataset.recordId))).toEqual(await order(c.frame))
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


it('searches the complete dataset and persists pagination without losing records or accumulating blank height',async()=>{
 const dataset=bookDataset();dataset.records=Array.from({length:61},(_,i)=>({...dataset.records[i%8],id:'B'+String(i+1).padStart(3,'0'),title:'演练古籍'+(i+1)}))
 const c=await open(priorityView(),{dataset})
 try{
  expect((await order(c.frame)).length).toBe(20)
  const height=()=>c.frame.locator('.dv-shell').evaluate(el=>el.getBoundingClientRect().height)
  const initial=await height()
  await c.frame.getByRole('button',{name:'下一页',exact:true}).click()
  expect((await order(c.frame))[0]).toBe('B021')
  await c.frame.getByRole('combobox',{name:'每页显示数量',exact:true}).selectOption('10')
  expect((await order(c.frame)).length).toBe(10)
  expect(await height()).toBeLessThan(initial-200)
  await c.frame.getByRole('combobox',{name:'表格页码',exact:true}).selectOption('6')
  expect(await order(c.frame)).toEqual(['B061'])
  const lastHeight=await height()
  await c.frame.getByRole('combobox',{name:'每页显示数量',exact:true}).selectOption('50')
  expect((await order(c.frame)).length).toBe(50)
  expect(await height()).toBeGreaterThan(lastHeight+700)
  await c.frame.getByRole('searchbox',{name:'搜索完整数据',exact:true}).fill('B061')
  await expect.poll(()=>order(c.frame)).toEqual(['B061'])
  expect(await c.frame.locator('[data-view-count]').textContent()).toContain('1 / 61')
  expect(await c.frame.locator('#dataset-view-source').evaluate(el=>JSON.parse(el.textContent).dataset)).toEqual(dataset)
  const reopened=await open(priorityView(),{dataset,saved:await c.saved()})
  try{
   expect(await order(reopened.frame)).toEqual(['B061'])
   expect(await reopened.frame.getByRole('combobox',{name:'每页显示数量',exact:true}).inputValue()).toBe('50')
   await reopened.frame.getByRole('searchbox',{name:'搜索完整数据',exact:true}).fill('')
   await reopened.frame.getByRole('combobox',{name:'每页显示数量',exact:true}).selectOption('100')
   expect((await order(reopened.frame)).length).toBe(61)
  }finally{await reopened.close()}
  const gap=await c.frame.locator('.dv-pagination').evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling.getBoundingClientRect().bottom)
  expect(gap).toBeGreaterThanOrEqual(10)
  expect((await c.page.evaluate(()=>window.viewEvents)).some(e=>e.type==='sherlock-content-failed')).toBe(false)
 }finally{await c.close()}
},20000)

it('applies a declared subset before search and paging without deleting canonical source rows',async()=>{
 const dataset=bookDataset(),selected=dataset.records[0],key=dataset.fields.find(f=>f.key!=='id').key
 const c=await open({dataset:dataset.id,where:[{field:key,op:'in',values:[selected[key]]}],filters:[],sections:[{kind:'records',fields:[key]}]},{dataset})
 try{
  const expected=dataset.records.filter(r=>r[key]===selected[key]).map(r=>r.id)
  expect(await order(c.frame)).toEqual(expected)
  expect(await c.frame.locator('#dataset-view-source').evaluate(el=>JSON.parse(el.textContent).dataset.records.length)).toBe(dataset.records.length)
  await c.frame.getByRole('searchbox',{name:'搜索完整数据'}).fill('unmatched')
  expect(await order(c.frame)).toEqual([])
  await c.frame.getByRole('searchbox',{name:'搜索完整数据'}).fill('')
  expect(await order(c.frame)).toEqual(expected)
 }finally{await c.close()}
})

it('mounts only the current page of a 244-row workbench and reaches late records through sorting and search',async()=>{
 const dataset=bookDataset()
 dataset.fields.push({key:'url',label:'原文链接'})
 dataset.records=Array.from({length:244},(_,i)=>({
  ...dataset.records[i%8],
  id:'P'+String(i+1).padStart(3,'0'),
  title:'市场产品'+(i+1),
  url:i===243?'https://example.org/product?id=244&source=exchange':'javascript:alert(1)'
 }))
 const view={...priorityView(),sections:[{kind:'records',fields:dataset.fields.map(field=>field.key)}]}
 const c=await open(view,{dataset})
 try{
  const rows=c.frame.locator('tbody tr')
  expect(await rows.count()).toBe(20)
  expect(await c.frame.locator('[data-view-count]').textContent()).toBe('显示 244 / 244 条记录')
  await c.frame.getByRole('combobox',{name:'表格页码',exact:true}).selectOption('12')
  expect(await rows.count()).toBe(4)
  expect(await order(c.frame)).toEqual(['P241','P242','P243','P244'])
  expect(await rows.last().getByRole('link').getAttribute('href')).toBe(dataset.records.at(-1).url)
  expect(await rows.first().getByRole('link').count()).toBe(0)
  await c.frame.getByRole('button',{name:'查看P244完整详情',exact:true}).click()
  expect(await c.frame.locator('.dv-detail').textContent()).toContain('记录 P244')
  const sort=c.frame.getByRole('button',{name:'按'+dataset.fields[0].label+'排序',exact:true})
  await sort.click()
  await sort.click()
  expect((await order(c.frame))[0]).toBe('P244')
  await c.frame.getByRole('searchbox',{name:'搜索完整数据',exact:true}).fill('P243')
  expect(await order(c.frame)).toEqual(['P243'])
  expect(await rows.count()).toBe(1)
  expect(await c.frame.locator('#dataset-view-source').evaluate(el=>JSON.parse(el.textContent).dataset.records)).toEqual(dataset.records)
 }finally{await c.close()}
},20000)


it('keeps disabled column labels readable and exposes the selected wide table scrollbar at its bottom',async()=>{
 const dataset=bookDataset()
 const view={dataset:dataset.id,sections:[{kind:'records',fields:dataset.fields.map(field=>field.key)}]}
 const {page,frame,close}=await open(view,{dataset,width:560,readOnly:true})
 try{
  const header=frame.locator('thead th').first()
  const contrast=(a,b)=>{
   const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
   const light=luminance(a),dark=luminance(b)
   return (Math.max(light,dark)+.05)/(Math.min(light,dark)+.05)
  }
  for(const mode of ['light','dark','enterprise','openterminal']){
   await frame.locator('html').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode)
   const colors=await header.evaluate(el=>{
    const label=getComputedStyle(el.querySelector('button'))
    return {background:getComputedStyle(el).backgroundColor,text:label.color,opacity:label.opacity}
   })
   expect(colors.opacity,mode).toBe('1')
   expect(contrast(colors.background,colors.text),mode).toBeGreaterThanOrEqual(4.5)
  }
  await page.addScriptTag({content:`
   const isWorkbenchScrollbarMessage=${isWorkbenchScrollbarMessage.toString()};
   const installWorkbenchScrollbars=${installWorkbenchScrollbars.toString()};
   const preview=document.querySelector('#preview'), card=document.createElement('article');
   card.style.cssText='position:relative;width:520px;height:600px;zoom:.8';
   document.body.append(card);card.append(preview);
   preview.style.height='100%';
   window.selectCard=selected=>{
    card.dataset.selected=String(selected);
    preview.contentWindow.postMessage({type:'sherlock-workbench-selection',selected},'*');
   };
   installWorkbenchScrollbars(card,()=>preview,()=>card.dataset.selected==='true',()=>[],()=>preview);
  `})
  await frame.locator('.dv-shell').waitFor()
  const wrap=frame.locator('.dv-table-wrap'),track=page.locator('article [data-workbench-scrollbar="x"]')
  expect(await wrap.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(100)
  expect(await track.isVisible()).toBe(false)
  await page.evaluate(()=>selectCard(true))
  await track.waitFor()
  expect(await track.getAttribute('data-workbench-table-scrollbar')).not.toBeNull()
  const trackBox=await track.boundingBox(),thumb=await track.locator('span').boundingBox()
  // Child-frame coordinates are local CSS pixels, even when the card is zoomed.
  const table=await wrap.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,bottom:r.bottom,width:innerWidth,height:innerHeight}})
  const viewport=await page.locator('#preview').boundingBox()
  expect(Math.abs(viewport.y+table.bottom*viewport.height/table.height-trackBox.y-trackBox.height)).toBeLessThanOrEqual(2)
  expect(trackBox.x).toBeGreaterThan(viewport.x+table.left*viewport.width/table.width)
  await page.mouse.move(thumb.x+thumb.width/2,thumb.y+thumb.height/2)
  await page.mouse.down();await page.mouse.move(thumb.x+thumb.width/2+70,thumb.y+thumb.height/2,{steps:5});await page.mouse.up()
  await expect.poll(()=>wrap.evaluate(el=>el.scrollLeft)).toBeGreaterThan(50)
  await page.evaluate(()=>selectCard(false))
  await track.waitFor({state:'hidden'})
  await page.evaluate(()=>selectCard(true))
  await track.waitFor()
  expect(await wrap.evaluate(el=>el.scrollLeft)).toBeGreaterThan(50)
 }finally{await close()}
},15000)
