import {describe,it,expect,vi,afterEach} from 'vitest'
import {JSDOM} from 'jsdom'
import {createCanvasUseSurface} from '../packages/dsh-research-task-runtime/canvas-use-surface.js'
import {CanvasUseTasks} from '../packages/dsh-research-task-runtime/canvas-use-tasks.js'
import {patchCanvasUseClient} from '../scripts/lib/canvas-use-client.mjs'
import {readFile} from 'node:fs/promises'
import {Script} from 'node:vm'

function surface(html){
 const dom=new JSDOM(html,{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window
 w.PointerEvent=w.MouseEvent
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:10,y:20,width:200,height:100,right:210,bottom:120}}
 const use=w.eval('('+createCanvasUseSurface.toString()+')(document.body)')
 return {dom,w,use}
}
describe('generic canvas interaction surface',()=>{
 it('edits a form and clicks its action, then observes real DOM state',async()=>{
  const {dom,w,use}=surface('<input aria-label="名称"><button>保存</button><output>尚未保存</output>')
  w.document.querySelector('button').onclick=()=>w.document.querySelector('output').textContent=w.document.querySelector('input').value
  let s=await use({op:'observe'});await use({op:'input',revision:s.revision,ref:s.elements.find(e=>e.tag==='input').ref,text:'新的事项'})
  s=await use({op:'observe'});await use({op:'click',revision:s.revision,ref:s.elements.find(e=>e.tag==='button').ref})
  expect((await use({op:'observe'})).text).toContain('新的事项');dom.window.close()
 })
 it('rejects stale content and removed or protected targets',async()=>{
  const {dom,w,use}=surface('<button>确定</button><input type="password" value="secret">')
  const s=await use({op:'observe'});expect(JSON.stringify(s)).not.toContain('secret')
  w.document.querySelector('button').textContent='状态已变化'
  await expect(use({op:'click',revision:s.revision,ref:s.elements[0].ref})).rejects.toThrow(/变化/)
  const next=await use({op:'observe'});await expect(use({op:'input',revision:next.revision,ref:next.elements[1].ref,text:'bad'})).rejects.toThrow(/接管/);dom.window.close()
 })
 it('routes normalized pointer coordinates and drag events to a canvas without game-specific code',async()=>{
  const {dom,w,use}=surface('<canvas></canvas>');const canvas=w.document.querySelector('canvas');canvas.toDataURL=()=>null
  const events=[];canvas.addEventListener('mousedown',e=>events.push([e.clientX,e.clientY,e.buttons]));canvas.addEventListener('mouseup',e=>events.push([e.clientX,e.clientY,e.buttons]))
  const s=await use({op:'observe'});await use({op:'drag',revision:s.revision,ref:s.elements[0].ref,point:{x:.25,y:.2},to:{x:.8,y:.9}})
  expect(events).toEqual([[60,40,1],[170,110,0]]);expect(w.document.querySelector('[data-canvas-use-cursor]')).not.toBeNull();dom.window.close()
 })
 it('observes checkbox state and real select values, including changes without text updates',async()=>{
  const {dom,use}=surface('<input type="checkbox"><select><option value="pending">待办</option><option value="done">完成</option></select>')
  let s=await use({op:'observe'});const original=s.revision;expect(s.elements[1].options[1]).toMatchObject({value:'done',label:'完成'})
  await use({op:'click',revision:s.revision,ref:s.elements[0].ref});s=await use({op:'observe'});expect(s.elements[0].checked).toBe(true);expect(s.revision).not.toBe(original)
  await use({op:'select',revision:s.revision,ref:s.elements[1].ref,value:'done'});expect((await use({op:'observe'})).elements[1].value).toBe('done');dom.window.close()
 })
 it('keeps injected client patch idempotent and syntactically valid',async()=>{
  const s=patchCanvasUseClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
  expect(patchCanvasUseClient(s)).toBe(s);expect(()=>new Script(s)).not.toThrow()
 })
})

describe('persistent whole-canvas tasks',()=>{
 afterEach(()=>vi.useRealTimers())
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}
 const setup=(execute=async()=>({status:'wait',reason:'等待其他用户',recheckMs:300000}))=>{
  vi.useFakeTimers();let state={writable:true,fingerprint:'a'},fail=false
  const observe=vi.fn(async()=>{if(fail)throw Error('画板已离开');return {...state}}),run=vi.fn(execute),save=vi.fn(async()=>{})
  const tasks=new CanvasUseTasks({observe,execute:run,save,pollMs:1000})
  return {tasks,run,observe,save,change:()=>state.fingerprint='b',leave:()=>fail=true,start:()=>tasks.start({sessionId:'board',goal:'跟踪所有组件的待办事项',completion:'全部事项完成',maxMinutes:1,maxActions:5})}
 }
 it('waits without model calls until content changes, and stops its watcher',async()=>{
  const f=setup(),t=await f.start();await flush();expect(f.run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(5000);expect(f.run).toHaveBeenCalledTimes(1)
  f.change();await vi.advanceTimersByTimeAsync(1100);expect(f.run).toHaveBeenCalledTimes(2)
  await f.tasks.control('board',t.id,'stop');await vi.advanceTimersByTimeAsync(5000);expect(f.run).toHaveBeenCalledTimes(2);expect(f.tasks.list('board')[0].state).toBe('stopped');await f.tasks.dispose()
 })
 it('cancels an active executor on takeover and rejects later actions',async()=>{
  let heldGuard;const f=setup(async(_t,_o,signal,guard)=>{heldGuard=guard;await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return {status:'complete',reason:'不应生效'}}),t=await f.start();await flush()
  await f.tasks.control('board',t.id,'takeover');await flush();await expect(heldGuard('use',{op:'click'})).rejects.toThrow();expect(f.tasks.list('board')[0].state).toBe('paused');await f.tasks.dispose()
 })
 it('requires observation after actions before accepting completion',async()=>{
  const f=setup(async(_t,_o,_s,guard)=>{await guard('use',{op:'click'});return {status:'complete',reason:'已点击'}});await f.start();await flush()
  expect(f.tasks.list('board')[0]).toMatchObject({state:'paused',actions:1});await f.tasks.dispose()
 })
 it('pauses on canvas removal and restores persisted tasks paused',async()=>{
  const f=setup();await f.start();await flush();f.leave();await vi.advanceTimersByTimeAsync(1100);expect(f.tasks.list('board')[0].state).toBe('paused')
  const stored=f.tasks.list('board');stored[0].state='running';await f.tasks.dispose();const next=setup();await next.tasks.restore(stored);expect(next.tasks.list('board')[0].state).toBe('paused');expect(next.run).not.toHaveBeenCalled();await next.tasks.dispose()
 })
 it('binds controls to their board and prevents two executors on one board',async()=>{
  const f=setup(),t=await f.start();await flush();await expect(f.start()).rejects.toThrow(/已有/);await expect(f.tasks.control('other',t.id,'stop')).rejects.toThrow(/不存在/);await f.tasks.dispose()
 })
 it('verifies the end condition against the latest host observation',async()=>{
  const f=setup(async()=>({status:'complete',reason:'全部完成'}));await f.start();await flush();expect(f.tasks.list('board')[0].state).toBe('completed');await f.tasks.dispose()
 })
})
