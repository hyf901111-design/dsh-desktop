import {afterEach,expect,it} from 'vitest'
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fixture} from './fixtures/pptx'
import {PptxArchive} from '../src/main/pptx/archive'
import {PptxAnnotationService} from '../src/main/pptx/annotations'
import {createPptxAnnotationDeliveryGate} from '../scripts/lib/pptx-annotation-delivery.mjs'
import {patchDeliverableCards,patchDeliveryConversation} from '../scripts/lib/deliverable-cards.mjs'
import {JSDOM,VirtualConsole} from 'jsdom'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {act} from 'react'

const dirs=[]
const cleanups=[]
afterEach(async()=>{for(const clean of cleanups.splice(0).reverse())await clean();await Promise.all(dirs.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
async function setup(count=1){
 const root=await mkdtemp(path.join(tmpdir(),'annotation-delivery-'));dirs.push(root);const workspace=path.join(root,'workspace');await mkdir(workspace)
 const archive=new PptxArchive(fixture()),bytes=archive.replace(new Map([['ppt/presentation.xml',Buffer.from(archive.read('ppt/presentation.xml').toString().replace('</p:presentation>','<p:sldSz cx="12192000" cy="6858000"/></p:presentation>'))]])),events=[],calls=[]
 const options={root:path.join(root,'state'),owner:()=> 'alice',resolveWorkspace:async id=>id==='session'?workspace:null,readHistory:async()=>({events:[...events],hasMore:false})}
 let service=new PptxAnnotationService(options);const references=[]
 for(let i=0;i<count;i++){
  const relativePath='source-'+i+'.pptx';await writeFile(path.join(workspace,relativePath),bytes)
  const doc=(await service.open({sessionId:'session',source:{kind:'workspace',relativePath}})).value
  const state=(await service.mutate({sessionId:'session',documentId:doc.documentId,version:doc.version,expectedStateRevision:0,operations:[{op:'put',mark:{slideIndex:0,slidePart:'ppt/slides/slide2.xml',kind:'point',region:{x:.25,y:.5},nodeIds:['2'],comment:'修订标题'}}]})).value
  references.push({version:1,sessionId:'session',documentId:doc.documentId,fileVersion:doc.version,markId:state.marks[0].id,expectedStateRevision:state.revision})
 }
 const prepared=(await service.prepare({sendingSessionId:'session',sendId:'send',expectedDraftRev:1,references})).value
 const jobs=new Set(),bridge=Object.fromEntries(['lookupOutput','bindSubmission','complete'].map(method=>[method,async input=>{calls.push([method,input]);const job=service[method](input);jobs.add(job);try{return await job}finally{jobs.delete(job)}}]))
 cleanups.push(async()=>{for(let i=0;i<10;i++){await Promise.allSettled([...jobs]);await new Promise(resolve=>setTimeout(resolve,5));if(!jobs.size)return}})
 const changed=text=>{const zip=new PptxArchive(bytes);return zip.replace(new Map([['ppt/slides/slide2.xml',Buffer.from(zip.read('ppt/slides/slide2.xml').toString().replace('年度',text))]]))}
 const output=async(index=0,value=changed('修订年度'))=>{const relative=prepared.documents[index].outputRelativePath,target=path.join(workspace,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,value);return target}
 const finish=()=>events.push({seq:1,type:'turn/start',data:{turn:1}},{seq:2,type:'step/start',data:{turn:1,step:1}},{seq:3,type:'user/message',data:{id:'user',role:'user',source:{kind:'user',rpcId:'actual-rpc'},content:[{type:'text',text:prepared.serializedReferences.map(ref=>ref.text).join('\n')}]}},{seq:4,type:'step/start',data:{turn:1,step:2}},{seq:5,type:'assistant/message',data:{turn:1,step:2,message:{id:'assistant',role:'assistant',content:[{type:'text',text:prepared.documents.map((doc,i)=>`[修改版${i}](${doc.outputRelativePath})`).join('\n')}]}}},{seq:6,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}})
 return{root,workspace,bytes,prepared,calls,bridge,changed,output,finish,get service(){return service},restart(){service=new PptxAnnotationService(options)}}
}
it('keeps ordinary files ordinary and does not call completion for an unrelated output',async()=>{
 const f=await setup(),gate=createPptxAnnotationDeliveryGate(f.bridge)
 expect(await gate.inspect({sendingSessionId:'session',path:path.join(f.workspace,'ordinary.pptx')})).toEqual({kind:'ordinary'})
 expect(f.calls.map(([method])=>method)).toEqual(['lookupOutput'])
})
it('keeps an unbound candidate pending, then uses its exact persisted prompt to verify a new editable output',async()=>{
 const f=await setup(),target=await f.output(),gate=createPptxAnnotationDeliveryGate(f.bridge),input={sendingSessionId:'session',path:target}
 expect(await gate.inspect(input)).toMatchObject({kind:'annotation',status:'pending',preparedId:f.prepared.preparedId})
 expect(f.calls.some(([method])=>method==='complete')).toBe(false);f.finish()
 const ready=await gate.inspect(input,{force:true});expect(ready).toMatchObject({kind:'annotation',status:'success',documentId:f.prepared.documents[0].documentId,submissionId:'actual-rpc',versionRecord:{preparedId:f.prepared.preparedId}})
 expect(f.calls.filter(([method])=>method==='complete').at(-1)[1].submissionId).toBe('actual-rpc');expect(await readFile(path.join(f.workspace,'source-0.pptx'))).toEqual(f.bytes)
})
it('does not turn a corrupt sibling into success when the real batch is partial',async()=>{
 const f=await setup(2),first=await f.output(),second=await f.output(1,Buffer.from('invalid ZIP'));f.finish();const gate=createPptxAnnotationDeliveryGate(f.bridge)
 const results=await Promise.all([first,second].map(value=>gate.inspect({sendingSessionId:'session',path:value})))
 expect(results[0]).toMatchObject({status:'success',documentId:f.prepared.documents[0].documentId});expect(results[1]).toMatchObject({status:'failed',documentId:f.prepared.documents[1].documentId,code:'invalid-output'})
 expect(f.calls.filter(([method])=>method==='complete')).toHaveLength(1)
})
it('rechecks a successful output on every open intent, including after restart, without reclaiming substituted bytes',async()=>{
 const f=await setup(),target=await f.output();f.finish();const input={sendingSessionId:'session',path:target},gate=createPptxAnnotationDeliveryGate(f.bridge)
 expect(await gate.inspect(input)).toMatchObject({status:'success'});const completions=f.calls.filter(([method])=>method==='complete').length
 f.restart();await writeFile(target,f.changed('另一份有效年度'))
 expect(await gate.inspect(input,{force:true})).toMatchObject({status:'failed',code:'invalid-output'});expect(f.calls.filter(([method])=>method==='complete')).toHaveLength(completions)
 expect(await createPptxAnnotationDeliveryGate(f.bridge).inspect(input)).toMatchObject({status:'failed'});expect(f.calls.filter(([method])=>method==='complete')).toHaveLength(completions)
})
it('keeps cancelled output candidates failed instead of rebinding or completing them',async()=>{
 const f=await setup(),target=await f.output();await f.service.cancel({sessionId:'session',sendId:'send'});const gate=createPptxAnnotationDeliveryGate(f.bridge)
 expect(await gate.inspect({sendingSessionId:'session',path:target})).toMatchObject({status:'failed',code:'cancelled'});expect(f.calls.map(([method])=>method)).toEqual(['lookupOutput'])
})
it('drops an aborted read while retaining the durable server fact, and never treats a lookup failure as ordinary',async()=>{
 const f=await setup(),target=await f.output();let release;const pending=new Promise(resolve=>release=resolve),bridge={...f.bridge,lookupOutput:async input=>{await pending;return f.bridge.lookupOutput(input)}},gate=createPptxAnnotationDeliveryGate(bridge),abort=new AbortController(),reading=gate.inspect({sendingSessionId:'session',path:target},{signal:abort.signal});abort.abort();release()
 await expect(reading).rejects.toMatchObject({name:'AbortError'});expect(await createPptxAnnotationDeliveryGate({lookupOutput:async()=>({ok:false,code:'forbidden',error:'账户已切换'})}).inspect({sendingSessionId:'session',path:target})).toMatchObject({kind:'unverified',status:'failed',code:'forbidden'})
})
it('does not start a late association after the account generation invalidates a shared lookup',async()=>{
 const f=await setup(),target=await f.output();let release;const pending=new Promise(resolve=>release=resolve),gate=createPptxAnnotationDeliveryGate({...f.bridge,lookupOutput:async input=>{await pending;return f.bridge.lookupOutput(input)}}),reading=gate.inspect({sendingSessionId:'session',path:target})
 gate.invalidate();release();await expect(reading).rejects.toMatchObject({name:'AbortError'});expect(f.calls.map(([method])=>method)).toEqual(['lookupOutput'])
})
it('does not advance a deferred binding to completion after its account generation is invalidated',async()=>{
 const f=await setup(),target=await f.output();f.finish();let release,started=false;const pending=new Promise(resolve=>release=resolve),gate=createPptxAnnotationDeliveryGate({...f.bridge,bindSubmission:async input=>{started=true;await pending;return f.bridge.bindSubmission(input)}}),reading=gate.inspect({sendingSessionId:'session',path:target})
 await expect.poll(()=>started).toBe(true);gate.invalidate();release();await expect(reading).rejects.toMatchObject({name:'AbortError'});expect(f.calls.some(([method])=>method==='complete')).toBe(false)
})

async function nativeCard(f,paths,bridge=f.bridge,strict=false){
 // Native CSS includes Chromium @starting-style; this fixture checks state/events, not CSS rendering.
 const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>{if(error.type!=='css parsing')throw error})
 const dom=new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>',{url:'http://localhost/',virtualConsole}),previous=new Map()
 for(const key of ['window','document','navigator','MouseEvent']){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]})}
 const priorAct=globalThis.IS_REACT_ACT_ENVIRONMENT;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 let descriptor,fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 window.__ModuleLoader__={load:value=>descriptor=value};window.sherlockPptAnnotations=bridge
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id.includes('primitives')?new Proxy({},{get:()=>()=>React.createElement('svg')}):fake
 new Function('window','document',patchDeliverableCards(await readFile('node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js','utf8')))(window,document);const delivery=descriptor.factory(modules);let slot;const system=[]
 delivery.apply({get:()=>({isLoopback:true,hostDescription:{},openPath:path=>system.push(path)}),conversationEvents:{register:()=>{}},locale:{register:()=>{},bind:()=>()=>''},effect:fn=>fn(),provide:()=>{},slots:{inject:(_key,fn)=>fn(),register:(entry,Component)=>{slot={...entry,Component}}}})
 const source=patchDeliveryConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Tail=TurnTailNodeView;')
 new Function('window','document',source)(window,document);const native=descriptor.factory(modules),opened=[],mount=document.querySelector('main'),root=createRoot(mount)
 cleanups.push(async()=>{await act(()=>root.unmount());dom.window.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}globalThis.IS_REACT_ACT_ENVIRONMENT=priorAct})
 const turn={status:'closed',data:new Map([['deliverables',{produced:paths.map(path=>({seq:5,path}))}]])},node={key:'native-tail',kind:'turn-tail',data:{turn:1,seq:6,closing:null},location:{kind:'turn',turn}}
 const tree=props=>{const element=React.createElement(native.__Tail,props);return strict?React.createElement(React.StrictMode,null,element):element}
 const render=async(sessionId='session')=>{await act(()=>root.render(tree({node,sessionId,cwd:f.workspace,openFile:path=>opened.push(path),useSession:select=>select({chat:{locations:{getTurn:()=>['native-tail']}}}),renderSlotChain:(name,owner)=>{expect(name).toBe('conversation.chat.turnTail');const matched=slot.select(owner);return matched?React.createElement(slot.Component,{...owner,...slot.inject(),matched,useHostDescription:()=>true}):null}})))}
 const wait=async predicate=>{await expect.poll(async()=>{await act(()=>new Promise(resolve=>setTimeout(resolve,5)));return predicate()},{timeout:3000}).toBe(true)}
 await render();return{mount,opened,system,render,wait,click:async target=>{await act(()=>target.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));await wait(()=>!mount.querySelector('[aria-busy=true]'))}}
}
it('uses the actual native turn-tail owner and blocks a pending candidate until its exact real ledger completes',async()=>{
 const f=await setup(),target=await f.output(),ui=await nativeCard(f,[target]);await ui.wait(()=>ui.mount.textContent.includes('待核验'));await ui.click(ui.mount.querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([])
 expect(f.calls.filter(([method])=>method==='lookupOutput').every(([,input])=>input.sendingSessionId==='session')).toBe(true);f.finish();await ui.click(ui.mount.querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([target]);expect(ui.mount.textContent).toContain('已核验')
})
it('shows separate verified and failed card states for a partial batch and refuses replaced bytes at the native open boundary',async()=>{
 const f=await setup(2),first=await f.output(),second=await f.output(1,Buffer.from('invalid'));f.finish();const ui=await nativeCard(f,[first,second]),cards=ui.mount.querySelectorAll('.ew-delivery-item');await ui.wait(()=>!!cards[0].querySelector('[data-annotation-status=success]')&&!!cards[1].querySelector('[data-annotation-status=failed]'))
 expect(cards[0].textContent).toContain('已核验');expect(cards[1].textContent).not.toContain('已核验');await ui.click(cards[1].querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([])
 await writeFile(first,f.changed('被替换的有效年度'));const completed=f.calls.filter(([method])=>method==='complete').length;await ui.click(cards[0].querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([]);expect(cards[0].querySelector('[role=alert]')).not.toBeNull();expect(f.calls.filter(([method])=>method==='complete')).toHaveLength(completed)
})
it('preserves the ordinary file path and does not offer historical all-material retry without a live frozen ticket',async()=>{
 const f=await setup(),target=await f.output(),ordinary=path.join(f.workspace,'ordinary.pptx');await f.service.cancel({sessionId:'session',sendId:'send'});const ui=await nativeCard(f,[ordinary,target]);await ui.wait(()=>ui.mount.textContent.includes('取消'))
 await ui.click(ui.mount.querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([ordinary]);expect(ui.mount.textContent).not.toContain('重新发送修改');expect(ui.mount.textContent).toContain('取消')
})
it('does not let a deferred old-owner classification mark or open the new session card',async()=>{
 const f=await setup(),target=await f.output();f.finish();let release;const pending=new Promise(resolve=>release=resolve),bridge={...f.bridge,lookupOutput:async input=>{if(input.sendingSessionId==='session')await pending;return f.bridge.lookupOutput(input)}}
 const ui=await nativeCard(f,[target],bridge),opening=ui.click(ui.mount.querySelector('.ew-delivery-open'));await ui.render('other-session');release();await opening
 expect(ui.opened).toEqual([]);expect(ui.mount.textContent).not.toContain('已核验');await ui.click(ui.mount.querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([target])
})
it('also gates the native default-app menu while retaining candidate copy and folder actions',async()=>{
 const f=await setup(),target=await f.output(0,f.bytes);f.finish();const ui=await nativeCard(f,[target]),folders=[],copied=[];window.dshDesktop={showItemInFolder:async path=>folders.push(path),copyFilePath:async path=>{copied.push(path);return{ok:true}}};await ui.render();await ui.wait(()=>!!ui.mount.querySelector('[data-annotation-status=failed]'))
 const choose=async text=>{await ui.click(ui.mount.querySelector('.ew-delivery-options'));await ui.click([...ui.mount.querySelectorAll('[role=menuitem]')].find(button=>button.textContent===text))}
 await choose('用默认应用打开');expect(ui.system).toEqual([]);await choose('在文件管理器中显示');expect(folders).toEqual([target]);await choose('复制文件路径');expect(copied).toEqual([target]);expect(ui.mount.querySelector('[data-annotation-status=failed]')).not.toBeNull()
})
it('offers retry only for the same live frozen ticket and keeps the old failed candidate distinct from a new request',async()=>{
 const f=await setup(),target=await f.output(0,f.bytes);f.finish();const ui=await nativeCard(f,[target]);await ui.wait(()=>!!ui.mount.querySelector('[data-annotation-status=failed]'));expect(ui.mount.textContent).not.toContain('重新发送修改')
 const retries=[];let ticketSession='other';window[Symbol.for('sherlock:pptx-annotation-input')]={getSubmissions:()=>[{sessionId:ticketSession,prepared:f.prepared,submissionId:'actual-rpc'}],retry:async id=>{retries.push(id);return{preparedId:'next-allocation'}}};await ui.render();expect(ui.mount.textContent).not.toContain('重新发送修改');ticketSession='session';await ui.render();await ui.click([...ui.mount.querySelectorAll('button')].find(button=>button.textContent==='重新发送修改'))
 expect(retries).toEqual([f.prepared.preparedId]);expect(ui.mount.querySelector('[data-annotation-status=failed]')).not.toBeNull();expect(ui.mount.textContent).not.toContain('已核验');expect(ui.opened).toEqual([])
})
it('schedules pending verification only while visible and cancels its timer when the window hides',async()=>{
 const f=await setup(),target=await f.output(),ui=await nativeCard(f,[target]);await ui.wait(()=>ui.mount.textContent.includes('待核验'));const timers=[],cleared=[],set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window)
 window.setTimeout=(fn,ms,...args)=>{if(ms===1000){timers.push(fn);return 90001}return set(fn,ms,...args)};window.clearTimeout=id=>{cleared.push(id);return clear(id)}
 const card=ui.mount.querySelector('.ew-delivery-card');card.getBoundingClientRect=()=>({left:10,top:10,right:300,bottom:150,width:290,height:140});Object.defineProperty(document,'hidden',{configurable:true,value:true});await act(()=>document.dispatchEvent(new window.Event('visibilitychange')));expect(timers).toHaveLength(0)
 Object.defineProperty(document,'hidden',{configurable:true,value:false});await act(()=>document.dispatchEvent(new window.Event('visibilitychange')));await ui.wait(()=>timers.length===1);cleared.length=0;Object.defineProperty(document,'hidden',{configurable:true,value:true});await act(()=>document.dispatchEvent(new window.Event('visibilitychange')));expect(cleared).toContain(90001)
})
it('retains ordinary native file opening after React replays the mount effects',async()=>{
 const f=await setup(),ordinary=path.join(f.workspace,'ordinary.pptx'),ui=await nativeCard(f,[ordinary],f.bridge,true);await ui.click(ui.mount.querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([ordinary]);expect(ui.mount.textContent).not.toContain('已核验')
})
it('keeps an account reset visible and drops late native-card replies and opening intents',async()=>{
 const f=await setup(),target=await f.output();f.finish();let release;const pending=new Promise(resolve=>release=resolve),ui=await nativeCard(f,[target],{...f.bridge,lookupOutput:async input=>{await pending;return f.bridge.lookupOutput(input)}}),opening=ui.click(ui.mount.querySelector('.ew-delivery-open'))
 await act(()=>window.dispatchEvent(new window.CustomEvent('sherlock:skill-menu-reset')));release();await opening;expect(ui.opened).toEqual([]);expect(ui.mount.textContent).toContain('账户或会话已变化');expect(f.calls.some(([method])=>method==='complete')).toBe(false)
})
it('clears a temporary verification error once a fresh lookup confirms the path is an ordinary file',async()=>{
 const f=await setup(),ordinary=path.join(f.workspace,'ordinary.pptx');let unavailable=true;const ui=await nativeCard(f,[ordinary],{...f.bridge,lookupOutput:input=>unavailable?Promise.resolve({ok:false,code:'unavailable',error:'临时无法核验'}):f.bridge.lookupOutput(input)})
 await ui.click(ui.mount.querySelector('.ew-delivery-open'));expect(ui.mount.textContent).toContain('临时无法核验');unavailable=false;await ui.click(ui.mount.querySelector('.ew-delivery-open'));expect(ui.opened).toEqual([ordinary]);expect(ui.mount.textContent).not.toContain('临时无法核验')
})
