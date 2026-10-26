import {afterAll, afterEach, beforeAll, expect, it, vi} from 'vitest'
import {JSDOM} from 'jsdom'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {act} from 'react'
import {readFileSync} from 'node:fs'
import {patchDeliverableCards, patchDeliveryConversation} from '../scripts/lib/deliverable-cards.mjs'

let plugin, selector, root, mount, definition
let dom
const previousGlobals=new Map()
let copied=true
const writeClipboard=vi.fn(async()=>copied)
const source=()=>readFileSync('node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js','utf8')
beforeAll(()=>{
 dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'http://localhost/'})
 for(const key of ['window','document','navigator','MouseEvent','KeyboardEvent']){previousGlobals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]})}
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 let descriptor
 window.__ModuleLoader__={load:value=>descriptor=value}
 new Function('window','document',patchDeliverableCards(source()))(window,document)
 plugin=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id.includes('primitives')?new Proxy({writeClipboard},{get:(target,key)=>target[key]??(()=>React.createElement('svg',{'aria-hidden':true}))}):{isAppendSurfaceEvent:()=>true})
 const ctx={get:()=>({isLoopback:true,hostDescription:{},openPath:()=>{}}),conversationEvents:{register:value=>{definition=value}},locale:{register:()=>{},bind:()=>()=>''},effect:fn=>fn(),provide:()=>{},slots:{inject:(_key,fn)=>fn(),register:value=>{selector=value.select}}}
 plugin.apply(ctx)
})
afterAll(()=>{dom?.window.close();for(const [key,value] of previousGlobals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}})
afterEach(async()=>{if(root)await act(()=>root.unmount());root=null;mount?.remove();delete window.dshDesktop;copied=true;vi.clearAllMocks()})
async function render(props){mount=document.createElement('div');document.body.append(mount);root=createRoot(mount);await act(()=>root.render(React.createElement(plugin.ProducedFiles,{matched:[],openFile:()=>{},isLoopback:true,useHostDescription:()=>true,...props})));return mount}
const click=async el=>{await act(()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})))}
it('selects only completed turn files and merges explicit final links without losing seq isolation',()=>{
 const owner={cwd:'/work',seq:10,text:'[正式 PDF](<outputs/研究（完整版）.pdf>) [PPT](outputs/演示.pptx)',turn:{status:'closed',data:new Map([['deliverables',{produced:[{seq:9,path:'/work/outputs/研究（完整版）.pdf'},{seq:11,path:'later.pdf'}]}]])}}
 expect(selector(owner)).toEqual(['/work/outputs/研究（完整版）.pdf','/work/outputs/演示.pptx'])
 expect(selector({...owner,turn:{...owner.turn,status:'open'}})).toBeNull()
})
it('only promotes clear inline-code deliveries in the actual closed turn tail',()=>{
 const owner={cwd:'/work',seq:10,text:'已完成，交付文件如下：\n- PPTX：`outputs/final.pptx`',turn:{status:'closed',data:new Map()}}
 expect(selector(owner)).toEqual(['/work/outputs/final.pptx'])
 expect(selector({...owner,turn:{...owner.turn,status:'open'}})).toBeNull()
 expect(selector({...owner,text:'当前候选文件：`outputs/final.pptx`，尚未通过原生验收，不正式交付。'})).toBeNull()
})
it('keeps an explicitly delivered custom inline-code format prominent',async()=>{
 const el=await render({matched:['/work/outputs/final.custom'],text:'交付文件：`outputs/final.custom`',cwd:'/work'})
 expect(el.querySelectorAll('.ew-delivery-list .ew-delivery-card')).toHaveLength(1)
 expect(el.querySelector('.ew-delivery-auxiliary')).toBeNull()
})
it('renders prominent named cards, custom final formats, and collapsed auxiliary files',async()=>{
 const long='贵州茅台（600519.SH）2026中报公司深度研究与DCF情景估值报告_2026-10-23.pdf'
 const el=await render({matched:['/work/'+long,'/work/演示.pptx','/work/交付.custom','/work/evidence.json'],text:'[指定文件](/work/交付.custom)',cwd:'/work'})
 expect(el.querySelectorAll('.ew-delivery-card')).toHaveLength(3)
 expect(el.querySelector('.ew-delivery-name').textContent).toBe(long)
 expect(el.querySelector('.ew-delivery-type').textContent).toContain('PDF')
 expect(el.querySelector('[aria-label="打开方式：'+long+'"]')).not.toBeNull()
 expect(el.querySelectorAll('.ew-delivery-auxiliary details:not([open])')).toHaveLength(1)
 expect(el.textContent).not.toContain('MB')
})
it('opens the exact selected file and supports keyboard-dismissed open choices',async()=>{
 const open=vi.fn(),system=vi.fn()
 const el=await render({matched:['/work/report.pdf'],openFile:open,openSystemFile:system,cwd:'/work'})
 await click(el.querySelector('.ew-delivery-open'))
 expect(open).toHaveBeenCalledExactlyOnceWith('/work/report.pdf')
 await click(el.querySelector('.ew-delivery-options'))
 expect(el.querySelector('[role=menu]')).not.toBeNull()
 await act(()=>el.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
 expect(el.querySelector('[role=menu]')).toBeNull()
 expect(document.activeElement).toBe(el.querySelector('.ew-delivery-options'))
 await click(el.querySelector('.ew-delivery-options'))
 await click(Array.from(el.querySelectorAll('[role=menuitem]')).find(e=>e.textContent.includes('默认应用')))
 expect(system).toHaveBeenCalledExactlyOnceWith('/work/report.pdf')
})
it.each([['zh','finder'],['zh','default-app'],['en','finder'],['en','default-app']])('opens via %s %s without an inline success notice',async(locale,action)=>{
 document.documentElement.dataset.odysseyLocale=locale
 try{
  const finder=vi.fn(async()=>{}),system=vi.fn(async()=>{})
  window.dshDesktop={showItemInFolder:finder,showFileContextMenu:vi.fn(async()=>action)}
  const el=await render({matched:['/work/report.pdf'],openSystemFile:system,cwd:'/work'})
  await click(el.querySelector('.ew-delivery-options'))
  expect(action==='finder'?finder:system).toHaveBeenCalledExactlyOnceWith('/work/report.pdf')
  expect(el.querySelector('.ew-delivery-status')).toBeNull();expect(el.querySelector('[role=menu]')).toBeNull();expect(el.querySelector('.ew-delivery-options').disabled).toBe(false)
 }finally{delete document.documentElement.dataset.odysseyLocale}
})
it.each(['finder','default-app'])('retains an actionable %s failure after removing successful-open notices',async action=>{
 const finder=vi.fn(async()=>{throw Error('文件暂时无法打开，请重试。')}),system=vi.fn(async()=>{throw Error('文件暂时无法打开，请重试。')})
 window.dshDesktop={showItemInFolder:finder,showFileContextMenu:vi.fn(async()=>action)}
 const el=await render({matched:['/work/report.pdf'],openSystemFile:system,cwd:'/work'})
 await click(el.querySelector('.ew-delivery-options'))
 expect(el.querySelector('[role=alert]')?.textContent).toContain('文件暂时无法打开');expect(el.querySelector('.ew-delivery-options').disabled).toBe(false)
})
it('opens from the whole file-card region while keeping the options button independent',async()=>{
 const open=vi.fn()
 const el=await render({matched:['/work/report.pdf'],openFile:open})
 await click(el.querySelector('.ew-delivery-card'))
 expect(open).toHaveBeenCalledExactlyOnceWith('/work/report.pdf')
 await click(el.querySelector('.ew-delivery-options'))
 expect(open).toHaveBeenCalledTimes(1)
 expect(el.querySelector('[role=menu]')).not.toBeNull()
})
it('reports a missing file in place instead of silently opening or claiming success',async()=>{
 window.dshDesktop={researchFilesAvailable:vi.fn(async()=>[false])}
 const open=vi.fn()
 const el=await render({matched:['/work/missing.pdf'],openFile:open,cwd:'/work'})
 await click(el.querySelector('.ew-delivery-open'))
 expect(open).not.toHaveBeenCalled()
 expect(el.textContent).toContain('文件已移动或不存在')
})
it('previews remote-host files without checking the same path on the desktop filesystem',async()=>{
 const exists=vi.fn(async()=>[false]),open=vi.fn()
 window.dshDesktop={researchFilesAvailable:exists,showItemInFolder:vi.fn()}
 const el=await render({matched:['/remote-host/report.pdf'],openFile:open,isLoopback:false,cwd:'/remote-host'})
 await click(el.querySelector('.ew-delivery-open'))
 expect(exists).not.toHaveBeenCalled()
 expect(open).toHaveBeenCalledExactlyOnceWith('/remote-host/report.pdf')
 await click(el.querySelector('.ew-delivery-options'))
 expect(el.textContent).not.toContain('文件管理器中显示')
 expect(el.textContent).not.toContain('默认应用')
})
it('does not claim copy succeeded when the real clipboard contract returns false',async()=>{
 copied=false
 const el=await render({matched:['/work/report.pdf']})
 await click(el.querySelector('.ew-delivery-options'))
 await click(Array.from(el.querySelectorAll('[role=menuitem]')).find(e=>e.textContent.includes('复制')))
 expect(writeClipboard).toHaveBeenCalledExactlyOnceWith('/work/report.pdf')
 expect(el.textContent).not.toContain('路径已复制')
 expect(el.querySelector('[role=alert]')).not.toBeNull()
})
it('uses native path copying after the OS menu returns instead of losing clipboard activation',async()=>{
 copied=false
 const nativeCopy=vi.fn(async()=>({ok:true}))
 window.dshDesktop={copyFilePath:nativeCopy,showFileContextMenu:vi.fn(async()=> 'absolute')}
 const el=await render({matched:['/work/正式报告（完整版）.pdf']})
 await click(el.querySelector('.ew-delivery-options'))
 expect(nativeCopy).toHaveBeenCalledExactlyOnceWith('/work/正式报告（完整版）.pdf')
 expect(writeClipboard).not.toHaveBeenCalled()
 expect(el.textContent).toContain('路径已复制')
})
it('does not use the legacy 512-character stat API to reject longer valid preview paths',async()=>{
 const path='/work/'+('nested/'.repeat(80))+'report.pdf',exists=vi.fn(async()=>[false]),open=vi.fn()
 window.dshDesktop={researchFilesAvailable:exists}
 const el=await render({matched:[path],openFile:open})
 await click(el.querySelector('.ew-delivery-open'))
 expect(exists).not.toHaveBeenCalled()
 expect(open).toHaveBeenCalledExactlyOnceWith(path)
})
it('patches installed conversation anchors once and fails safely on source drift',()=>{
 const conversation=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const out=patchDeliveryConversation(conversation)
 expect(out).toContain('text: closing ? assistantText(closing.blocks) : ""')
 expect(out).toContain('sessionId, cwd,')
 expect(patchDeliveryConversation(out)).toBe(out)
 const patched=patchDeliverableCards(source())
 expect(patchDeliverableCards(patched)).toBe(patched)
 expect(()=>patchDeliverableCards('changed upstream')).toThrow(/anchor/i)
 new Function(patched);new Function(out)
})

it('keeps private demo files durable without a presenter and admits nothing before a successful result and closed turn',()=>{
 const packet={kind:'ework-home-guide-delivery',version:1,tool:'home_report_publish',ok:true,status:'completed',files:[{format:'html',path:'/work/报告 (中文).html'},{format:'pdf',path:'/work/报告 (中文).pdf'}]}
 const initial=()=>definition.start({}, {event:{type:'turn/start',data:{turn:1}}})
 const call=(state,name='home_report_publish',view)=>definition.update({state},{event:{type:'tool/call',seq:1,data:{turn:1,callId:'publish',name}},view})
 const finish=(state,error=false,status='completed')=>definition.update({state},{event:{type:'tool/result',seq:2,data:{message:{source:{kind:'tool',callId:'publish'},content:[{type:'tool-result',toolCallId:'publish',isError:error,content:[{type:'text',text:JSON.stringify({...packet,status})}]}]}}}})
 const paths=(state,status='closed')=>selector({seq:3,text:'已保存研究报告。',cwd:'/work',turn:{status,data:new Map([['deliverables',{produced:state.produced}]])}})
 const pending=call(initial());expect(paths(pending)).toBeNull()
 expect(paths(finish(pending,true))).toBeNull()
 const announced=call(initial(),'home_report_publish',{for:'call',view:{card:'generic',kind:'edit',locations:[{path:'/work/early.html'},{path:'/work/early.pdf'}]}})
 expect(paths(finish(announced,false,'cancelled'))).toBeNull();expect(paths(finish(announced,false,'failed'))).toBeNull()
 expect(paths(finish(pending),'open')).toBeNull()
 expect(paths(finish(call(initial(),'ordinary_tool')))).toBeNull()
 expect(paths(finish(pending))).toEqual(['/work/报告 (中文).html','/work/报告 (中文).pdf'])
 const ordinary=call(initial(),'str_replace_editor',{for:'call',view:{card:'generic',kind:'edit',locations:[{path:'/work/ordinary.md'}]}})
 expect(paths(finish(ordinary))).toEqual(['/work/ordinary.md'])
})
it('upgrades the exact legacy delivery accumulator once and rejects unknown or duplicate new hooks',()=>{
 const patched=patchDeliverableCards(source()),marker='/* ework:home-guide-delivery-accumulator:v1 */'
 expect(patched.split(marker)).toHaveLength(2);expect(patchDeliverableCards(patched)).toBe(patched)
 expect(()=>patchDeliverableCards(patched.replace(marker,marker+marker))).toThrow(/drifted/)
 expect(()=>patchDeliverableCards(patched.replace('name:match.event.data.name','name:"pretend-tool"'))).toThrow(/drifted/)
})
