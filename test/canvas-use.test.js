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
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:10,y:20,left:10,top:20,width:200,height:100,right:210,bottom:120}}
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
 it('supports local form submit handlers without permitting navigation, including Enter and validation',async()=>{
  const {dom,w,use}=surface('<form><input required><button type="submit">保存</button><output></output></form>')
  const source=await readFile('packages/dsh-research-task-runtime/html-artifact.js','utf8')
  const start=source.indexOf('  const submitLocally ='),local=source.slice(start,source.indexOf("  document.addEventListener('DOMContentLoaded'",start))
  w.eval(local)
  const form=w.document.querySelector('form'),input=w.document.querySelector('input'),button=w.document.querySelector('button'),out=w.document.querySelector('output');let count=0
  form.onsubmit=e=>{e.preventDefault();expect(e.submitter).toBe(button);out.textContent=input.value;count++}
  button.click();expect(count).toBe(0)
  let s=await use({op:'observe'});await use({op:'input',revision:s.revision,ref:s.elements.find(e=>e.tag==='input').ref,text:'表单验收'})
  s=await use({op:'observe'});await use({op:'click',revision:s.revision,ref:s.elements.find(e=>e.tag==='button').ref});expect(count).toBe(1);expect(out.textContent).toBe('表单验收')
  s=await use({op:'observe'});await use({op:'key',revision:s.revision,ref:s.elements.find(e=>e.tag==='input').ref,key:'Enter'});expect(count).toBe(2)
  button.onclick=e=>e.preventDefault();button.click();expect(count).toBe(2);dom.window.close()
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
  expect(f.tasks.list('board')[0]).toMatchObject({state:'waiting',actions:1});await f.tasks.dispose()
 })
 it('waits on temporary canvas removal and restores persisted tasks paused',async()=>{
  const f=setup();await f.start();await flush();f.leave();await vi.advanceTimersByTimeAsync(1100);expect(f.tasks.list('board')[0].state).toBe('waiting')
  const stored=f.tasks.list('board');stored[0].state='running';await f.tasks.dispose();const next=setup();await next.tasks.restore(stored);expect(next.tasks.list('board')[0].state).toBe('paused');expect(next.run).not.toHaveBeenCalled();await next.tasks.dispose()
 })
 it('binds controls to their board and prevents two executors on one board',async()=>{
  const f=setup(),t=await f.start();await flush();await expect(f.start()).rejects.toThrow(/已有/);await expect(f.tasks.control('other',t.id,'stop')).rejects.toThrow(/不存在/);await f.tasks.dispose()
 })
 it('verifies the end condition against the latest host observation',async()=>{
  const f=setup(async()=>({status:'complete',reason:'全部完成'}));await f.start();await flush();expect(f.tasks.list('board')[0].state).toBe('completed');await f.tasks.dispose()
 })
})

it('uses supported low latency reasoning without changing provider/model or inventing unsupported effort',async()=>{
 const {taskModelSelection}=await import('../packages/dsh-research-task-runtime/canvas-use-tasks.js')
 const current={provider:'p',model:'m',reasoningEffort:'high'}
 expect(taskModelSelection({current,groups:[{id:'p',models:[{id:'m',reasoning:{efforts:[{id:'high'},{id:'low'}]}}]}]})).toEqual({...current,reasoningEffort:'low'})
 expect(taskModelSelection({current,groups:[]})).toEqual(current)
})
it('watches relevant components without waking for unrelated timers and still detects removal',async()=>{
 const {taskFingerprint}=await import('../packages/dsh-research-task-runtime/canvas-use-tasks.js')
 const a={fingerprint:'all1',nodeFingerprints:{target:'stable',timer:'1'}},b={fingerprint:'all2',nodeFingerprints:{target:'stable',timer:'2'}}
 expect(taskFingerprint(a,['target'])).toBe(taskFingerprint(b,['target']))
 expect(taskFingerprint(a,[])).not.toBe(taskFingerprint(b,[]))
 expect(taskFingerprint(b,['target'])).not.toBe(taskFingerprint({...b,nodeFingerprints:{}},['target']))
})

it('scoped waits ignore unrelated activity and wake within one poll when the target changes',async()=>{
 vi.useFakeTimers();let tick=0,target='a'
 const observe=vi.fn(async()=>({writable:true,fingerprint:String(++tick),nodeFingerprints:{target,timer:String(tick)}}))
 const execute=vi.fn(async()=>({status:'wait',reason:'等目标变化',watchNodeIds:['target']}))
 const tasks=new CanvasUseTasks({observe,execute})
 try {
  await tasks.start({sessionId:'scoped',goal:'跟踪目标',completion:'目标完成'})
  await vi.advanceTimersByTimeAsync(4000);expect(execute).toHaveBeenCalledTimes(1)
  target='b';await vi.advanceTimersByTimeAsync(750);expect(execute).toHaveBeenCalledTimes(2)
 }finally{await tasks.dispose();vi.useRealTimers()}
})

it('wakes immediately on a generic change signal and still ignores unchanged content',async()=>{
 vi.useFakeTimers();let value='a'
 const execute=vi.fn(async()=>({status:'wait',reason:'等待内容变化'}))
 const tasks=new CanvasUseTasks({pollMs:5000,observe:async()=>({writable:true,fingerprint:value}),execute})
 try {
  const task=await tasks.start({sessionId:'wake',goal:'跟踪变化',completion:'完成'})
  await vi.advanceTimersByTimeAsync(1);expect(execute).toHaveBeenCalledTimes(1)
  tasks.wake('different');tasks.wake('wake');await vi.advanceTimersByTimeAsync(1);expect(execute).toHaveBeenCalledTimes(1)
  value='b';tasks.wake('wake');await vi.advanceTimersByTimeAsync(1);expect(execute).toHaveBeenCalledTimes(2)
  await tasks.control('wake',task.id,'stop');value='c';tasks.wake('wake');await vi.advanceTimersByTimeAsync(6000);expect(execute).toHaveBeenCalledTimes(2)
 } finally {await tasks.dispose();vi.useRealTimers()}
})

it('keeps the named small cursor during waiting, follows a curved path and removes it on stop',async()=>{
 const {dom,w}=surface('<main><article data-research-node-id="n"><div class="rScV5Q_previewBody"><button>加一</button></div></article></main>')
 const raw=patchCanvasUseClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const code=raw.slice(raw.indexOf('/* CANVAS_USE_CLIENT_START */'),raw.indexOf('/* CANVAS_USE_CLIENT_END */'))
 w.eval(code.replace(/__vite_ssr_import_\d+__\.createCanvasUseSurface/g,'createCanvasUseSurface')+';window.testStore=canvasTaskStore;window.testInstall=(id,workspace,root)=>installCanvasUseClient(id,workspace,root,agentCursorMarkup);window.testUse=canvasUseOwners;')
 w.eval('var sherlockShared=()=>false;var sherlockBoardsAdapter={getState:()=>({account:{user:{username:"hyf90"}}})};')
 w.fetch=vi.fn(async()=>({ok:true,json:async()=>({tasks:[]})}))
 const state={files:[],artifacts:[{id:'n'}],viewport:{x:0,y:0,scale:1},selection:{selectedNodeIds:[]}}
 const root=w.document.querySelector('main'),listeners=new Set()
 let physicalDown;const add=root.addEventListener.bind(root);root.addEventListener=(type,fn,options)=>{if(type==='pointerdown')physicalDown=fn;add(type,fn,options)}
 const cleanup=w.testInstall('cursor',{getSnapshot:()=>state,canvasAction:async()=>({revision:'r',writable:true}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}},root)
 try {
  const task={id:'t',state:'waiting',updatedAt:1,createdAt:1};w.testStore('cursor').update([task])
  let cursor=root.querySelector('[data-canvas-use-cursor]');expect(cursor.textContent).toBe('hyf90的智能助理');expect(cursor.querySelector('svg').getAttribute('width')).toBe('18')
  await new Promise(r=>setTimeout(r,1300));expect(cursor.isConnected).toBe(true)
  const use=w.testUse.get('cursor')
  root.setAttribute('data-research-operation','pan')
  await expect(use({op:'observe'})).rejects.toThrow(/用户正在操作/)
  root.removeAttribute('data-research-operation')
  root.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,altKey:true}))
  expect(w.fetch).not.toHaveBeenCalled();expect(w.testStore('cursor').value[0].state).toBe('waiting')
  physicalDown({isTrusted:true,button:0});await expect(use({op:'observe'})).rejects.toThrow(/用户正在操作/);expect(cursor.isConnected).toBe(true);w.dispatchEvent(new w.MouseEvent('pointerup'));
  const observation=await use({op:'observe'}),s=observation.surfaces[0];expect(s.error).toBeUndefined()
  const positions=[];const raf=w.requestAnimationFrame.bind(w);w.requestAnimationFrame=fn=>raf(t=>{positions.push([cursor.style.transform]);fn(t)})
  await use({op:'click',requestId:'click',revision:observation.revision,nodeId:'n',surfaceRevision:s.revision,ref:s.elements[0].ref})
  expect(positions.length).toBeGreaterThan(2);expect(new Set(positions.map(p=>p.join())).size).toBeGreaterThan(2)
  expect(root.querySelectorAll('[data-canvas-use-cursor]')).toHaveLength(1)
  w.testStore('cursor').update([{...task,state:'stopped',updatedAt:2}]);expect(root.querySelector('[data-canvas-use-cursor]')).toBeNull()
 } finally {cleanup();dom.window.close()}
})

it('rejects delayed older task responses after the composer has stopped the task',async()=>{
 const {canvasTaskStore}=await import('../scripts/lib/canvas-use-client.mjs')
 const {runInNewContext}=await import('node:vm');const calls=[]
 const create=runInNewContext('('+canvasTaskStore.toString()+')',{canvasTaskStores:new Map(),setInterval,clearInterval,fetch:async(_url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({tasks:[{id:'t',state:'stopped',updatedAt:3}]})}}})
 const store=create('s');store.update([{id:'t',state:'waiting',updatedAt:2}]);await store.stop()
 store.update([{id:'t',state:'running',updatedAt:1}]);expect(store.value[0].state).toBe('stopped');expect(calls).toEqual([{sessionId:'s',taskId:'t',action:'stop'}])
})

it('accepts a valid task decision surrounded by commentary, but never infers completion from prose',async()=>{
 const {parseCanvasTaskDecision}=await import('../packages/dsh-research-task-runtime/canvas-use-tasks.js')
 expect(parseCanvasTaskDecision('保存已确认。\n```json\n{"status":"wait","reason":"等待用户停止"}\n```')).toEqual({status:'wait',reason:'等待用户停止'})
 expect(()=>parseCanvasTaskDecision('已完成')).toThrow(/有效/)
 expect(()=>parseCanvasTaskDecision('{"status":"wait","reason":"a"}{"status":"complete","reason":"b"}')).toThrow(/唯一/)
})

it('polls shared canvas state without encoding pictures and keeps observation/action revisions consistent',async()=>{
 const {dom,w}=surface('<canvas></canvas>'),canvas=w.document.querySelector('canvas');let state={revision:1,state:{count:0},connected:true}
 const encode=vi.fn(()=> 'data:image/png;base64,AA==');canvas.toDataURL=encode
 w.shared=()=>state
 const use=w.eval('('+createCanvasUseSurface.toString()+')(document.body,window.shared)')
 try {
  const light=await use({op:'observe',images:false});expect(encode).not.toHaveBeenCalled();expect(light.elements[0].image).toBeUndefined()
  const visual=await use({op:'observe'});expect(encode).toHaveBeenCalledTimes(1);expect(visual.revision).toBe(light.revision)
  state={...state,revision:2,state:{count:1}}
  const changed=await use({op:'observe',images:false});expect(changed.revision).not.toBe(light.revision);expect(encode).toHaveBeenCalledTimes(1)
 }finally{dom.window.close()}
})
