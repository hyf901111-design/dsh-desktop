import {afterEach,expect,it,vi} from 'vitest'
import {createRequire} from 'node:module'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
const require=createRequire(import.meta.url),React=require('react'),{createRoot}=require('react-dom/client'),close=[]
afterEach(async()=>{for(const fn of close.splice(0))await fn()})

it('uses the live research refresh states in note headers, hides static refresh, and acknowledges manual refresh errors',async()=>{
 let notify,fail=false,resolveRefresh
 const data={request:vi.fn(async()=>[]),subscribe:vi.fn(fn=>{notify=fn;return()=>{}})}
 const f=await financialClientFixture({componentData:data},{notes:true,refreshState:true}),section=f.document.createElement('section');section.className='en-root';section.innerHTML='<section class="en-research en-native-component"><header id="refresh-title"></header><div id="refresh-host" class="en-native-component-host" data-note-component="refresh" data-note-session="notes-refresh"></div></section>';f.document.body.append(section)
 const outlet=f.document.createElement('div');f.document.body.append(outlet);const root=createRoot(outlet),actions=[]
 const node={id:'refresh',kind:'generated-container',title:'真实数据',containerPrompt:'更新数据',generationStatus:'completed',containerSpec:{version:1,type:'markdown',title:'原始数据',content:'原始内容'},noteDataBound:true}
 const publish=value=>f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-view',{detail:{instanceId:'refresh-instance',hostId:'refresh-host',headerId:'refresh-title',sessionId:'notes-refresh',node:value,refresh:0}}))
 const receive=event=>{const value=event.detail;if(value.action!=='refresh')return;actions.push(value);resolveRefresh=()=>f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:value.instanceId,sessionId:value.sessionId,requestId:value.requestId,ok:!fail,message:fail?'来源请求失败':undefined}}))}
 f.document.addEventListener('sherlock:notes-component-action',receive)
 close.push(async()=>{f.document.removeEventListener('sherlock:notes-component-action',receive);await f.act(async()=>root.unmount());await f.dispose()})
 await f.act(async()=>{root.render(React.createElement(f.bundle.EWorkNoteComponentViews,{sessionId:'notes-refresh',active:true}));publish(node)})
 expect(section.querySelector('[data-workbench-refresh]')).toBeNull()
 const row={nodeId:'refresh',enabled:true,intervalMinutes:1,status:'success',lastSuccess:1,successSequence:1},push=async update=>f.act(async()=>notify({sessionId:'notes-refresh',rows:[{...row,...update}]}))
 await push({});expect(section.querySelector('[data-refresh-state="scheduled"] [data-workbench-icon="refresh"]')).toBeTruthy()
 await push({status:'error'});expect(section.querySelector('[data-refresh-state="error"]')).toBeTruthy()
 await push({status:'refreshing'});expect(section.querySelector('[data-busy="true"]')).toBeTruthy();expect(section.querySelector('button').disabled).toBe(true)
 await push({status:'success',successSequence:2,lastSuccess:2});expect(section.querySelector('[data-refresh-state="scheduled"]')).toBeTruthy()
 await push({enabled:false,intervalMinutes:0});expect(section.querySelector('[data-refresh-state="manual"] [data-workbench-icon="refresh-manual"]')).toBeTruthy()
 fail=true;await f.event('click',section.querySelector('[data-workbench-refresh]'));expect(section.querySelector('[data-busy="true"]')).toBeTruthy();expect(actions).toHaveLength(1)
 await f.act(async()=>resolveRefresh());expect(section.querySelector('[data-busy]')).toBeNull();expect(section.querySelector('[data-refresh-state="manual"]')).toBeTruthy()
 await f.act(async()=>{notify({sessionId:'notes-refresh',rows:[]});publish({...node,noteDataBound:false})});expect(section.querySelector('[data-workbench-refresh]')).toBeNull()
},15000)

it('mounts the original research controls in note hosts, acknowledges cloned changes and positions index settings from the component header',async()=>{
 const symbol={code:'600519',market:'SH',name:'验收标的'},bridge={request:vi.fn(async v=>v.action==='search'?{symbols:[symbol]}:{quotes:(v.symbols||[]).map(s=>({...s,price:100,changePercent:1})),source:'验证来源'})}
 const f=await financialClientFixture({financialWidget:bridge},{notes:true}),section=f.document.createElement('section');section.className='en-root';f.document.body.append(section)
 const outlet=f.document.createElement('div');f.document.body.append(outlet);const viewer=createRoot(outlet),entries=new Map(),actions=[]
 const publish=entry=>{entries.set(entry.instanceId,entry);f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-view',{detail:structuredClone(entry)}))}
 const make=(id,widget)=>{const spec=financialWidgetDefaults(widget);section.insertAdjacentHTML('beforeend',`<section class="en-research" data-research-node-id="${id}"><header><div id="title-${id}"></div><button data-workbench-more="${id}" aria-label="组件更多操作"></button></header><div id="${id}" class="en-native-component-host" data-note-component="${id}" data-note-session="notes-test"></div></section>`);return {instanceId:id,hostId:id,headerId:'title-'+id,sessionId:'notes-test',node:{id,title:spec.title,containerSpec:spec,noteLibrary:true},dark:true,refresh:0}}
 const change=event=>{const value=structuredClone(event.detail);if(value.action!=='spec')return;actions.push(value);const entry=entries.get(value.instanceId);publish({...entry,node:{...entry.node,containerSpec:value.next}});f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:value.instanceId,sessionId:value.sessionId,requestId:value.requestId,ok:true}}))}
 f.document.addEventListener('sherlock:notes-component-action',change)
 close.push(async()=>{f.document.removeEventListener('sherlock:notes-component-action',change);await f.act(async()=>viewer.unmount());await f.dispose()})
 await f.act(async()=>{viewer.render(React.createElement(f.bundle.EWorkNoteComponentViews,{sessionId:'notes-test',active:true}));publish(make('watch','watchlist'));publish(make('index','indices'));publish(make('quote','quote'))})
 await f.event('click',section.querySelector('#watch [aria-label="添加自选股"]'))
 const search=section.querySelector('#watch input');await f.input(search,'600519');await f.act(async()=>{await new Promise(resolve=>setTimeout(resolve,260))});expect(f.document.querySelector('.ew-financial-suggestions [role=option]')).toBeTruthy()
 await f.event('click',f.document.querySelector('.ew-financial-suggestions [role=option]'))
 expect(actions.at(-1).next.symbols).toEqual([symbol]);expect(section.querySelector('#watch input')).toBeNull();expect(section.querySelector('#watch [data-stock-code="600519"]')).toBeTruthy()
 await f.act(async()=>{const adapter=section.querySelector('#title-index').closest('[data-research-node-id]').__eworkNoteMenu;expect(adapter.instanceId).toBe('index');adapter.openIndices()})
 const dialog=f.document.querySelector('[aria-label="配置指数"][role=dialog]');expect(dialog).toBeTruthy();expect(dialog.style.visibility).toBe('visible');expect(Number.parseFloat(dialog.style.width)).toBeGreaterThan(0)
 const apply=[...dialog.querySelectorAll('button')].find(button=>button.textContent==='应用'||button.textContent==='保存');expect(apply).toBeTruthy();await f.event('click',apply)
 expect(actions.at(-1).instanceId).toBe('index');expect(f.document.querySelector('[aria-label="配置指数"][role=dialog]')).toBeNull()
 expect(section.querySelector('#title-quote .ew-financial-header-selector')).toBeTruthy()
 expect(section.querySelector('[role=alert]')).toBeNull()
},15000)
it('reuses the actual research generation process, grid, progress, stopping and retry controls in a note portal',async()=>{
 const f=await financialClientFixture({}, {notes:true}),section=f.document.createElement('section');section.className='en-root';section.innerHTML='<section class="en-research" data-research-compact-chrome data-research-node-id="smart"><header id="smart-title" hidden></header><div id="smart-host" class="en-native-component-host" data-note-component="smart" data-note-session="notes-generation"></div></section>';f.document.body.append(section)
 let acknowledge=true
 const outlet=f.document.createElement('div');f.document.body.append(outlet);const root=createRoot(outlet),actions=[],node={id:'smart',kind:'generated-container',title:'同一研究组件',containerPrompt:'查证资料',generationStatus:'running',generationTaskId:'task-a',generationStartedAt:Date.now()-4000,generationEvents:[{type:'tool-started',tool:'网页搜索',detail:'查证来源',seq:1}]}
 const entry={instanceId:'smart-view',hostId:'smart-host',headerId:'smart-title',sessionId:'notes-generation',mode:'generation',node,dark:false,refresh:0},publish=value=>f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-view',{detail:structuredClone(value)})),action=event=>{const value=structuredClone(event.detail);actions.push(value);f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-ack',{detail:{sessionId:value.sessionId,instanceId:value.instanceId,requestId:value.requestId,ok:acknowledge,message:acknowledge?undefined:'组件任务已变化'}}))}
 f.document.addEventListener('sherlock:notes-component-action',action);close.push(async()=>{f.document.removeEventListener('sherlock:notes-component-action',action);await f.act(async()=>root.unmount());await f.dispose()})
 await f.act(async()=>{root.render(React.createElement(f.bundle.EWorkNoteComponentViews,{sessionId:'notes-generation',active:true}));publish(entry)})
 expect(section.querySelector('[data-research-generation-process]')).toBeTruthy();expect(section.querySelector('[data-research-generation-grid]')).toBeTruthy();expect(section.textContent).toContain('正在查找资料');expect(section.textContent).toContain('网页搜索');expect(section.textContent).toContain('同一研究组件')
 await f.event('click',section.querySelector('[aria-label="停止生成"]'));expect(actions.at(-1)).toMatchObject({action:'generation-stop',taskId:'task-a',nodeId:'smart'});expect(section.querySelector('[data-generation-ui-state="stopping"]')).toBeTruthy()
 await f.act(async()=>publish({...entry,node:{...node,generationStatus:'cancelled',generationCompletedAt:Date.now()}}));expect(section.textContent).toContain('已停止生成');await f.event('click',section.querySelector('[aria-label="重新生成"]'));expect(actions.at(-1)).toMatchObject({action:'generation-retry',taskId:'task-a',nodeId:'smart'})
 acknowledge=false;await f.event('click',section.querySelector('[aria-label="重新生成"]'));expect(section.querySelector('[data-progress-detail]').textContent).toContain('组件任务已变化')
},15000)

it('opens spreadsheet card actions in the shared menu and adds range navigation to the native footer',async()=>{
 const financialWidget={request:vi.fn(async()=>({quotes:[],source:'验收来源'}))}
 const f=await financialClientFixture({financialWidget},{notes:true})
 const workSheet=f.document.createElement('div')
 workSheet.dataset.eworkSpreadsheetView='sheet-session'
 workSheet.innerHTML='<section class="ew-sheet-component-card"><div id="sheet-title"></div><div class="ew-sheet-component-host" id="sheet-card" data-sheet-session="sheet-session" data-sheet-component="indices"></div></section>'
 f.document.body.append(workSheet)
 const outlet=f.document.createElement('div')
 f.document.body.append(outlet)
 const root=createRoot(outlet),actions=[]
 const receive=event=>{
  const value=event.detail
  actions.push(value.action)
  f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-ack',{detail:{...value,ok:true}}))
 }
 f.document.addEventListener('sherlock:notes-component-action',receive)
 close.push(async()=>{
  f.document.removeEventListener('sherlock:notes-component-action',receive)
  await f.act(async()=>root.unmount())
  await f.dispose()
 })
 await f.act(async()=>{
  root.render(React.createElement(f.bundle.EWorkNoteComponentViews,{sessionId:'sheet-session',spreadsheet:true}))
  f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-view',{detail:{
   surface:'spreadsheet',mode:'component',instanceId:'sheet-instance',hostId:'sheet-card',headerId:'sheet-title',
   sessionId:'sheet-session',dark:true,source:'月度收益!A1:F6',node:{id:'indices',title:'市场指数',containerSpec:financialWidgetDefaults('indices')}
  }}))
 })
 const more=workSheet.querySelector('[data-workbench-more]')
 const menu=()=>f.document.querySelector('[data-component-menu-surface=spreadsheet]')
 expect(workSheet.querySelector('.ew-financial-footer .ew-sheet-native-source')?.title).toBe('月度收益!A1:F6')
 expect(workSheet.querySelector('.ew-financial-footer .ew-sheet-native-source')?.textContent).toBe('月度收益!A1:F6')
 expect(workSheet.querySelector('header[data-workbench-spreadsheet-header] [data-workbench-ask]')).toBeTruthy()
 await f.event('click',more)
 expect(more.getAttribute('aria-expanded')).toBe('true')
 expect(menu()).toBeTruthy()
 expect(menu().querySelector('[data-component-menu-action=export]')?.getAttribute('aria-haspopup')).toBe('menu')
 expect(menu().querySelector('[data-component-menu-action=source-details]')?.textContent).toBe('查看来源信息')
 await f.event('click',menu().querySelector('[data-component-menu-action=source]'))
 expect(actions).toEqual(['source'])
 expect(menu()).toBeNull()
 expect(more.getAttribute('aria-expanded')).toBe('false')
},15000)
