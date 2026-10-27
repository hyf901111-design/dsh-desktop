import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {expect,it} from 'vitest'
import {createPptxAnnotationCoordinator} from '../scripts/lib/pptx-annotation-coordinator.mjs'

async function fixture(){
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const load=async(name,deps={})=>{let descriptor;runInNewContext(await readFile('node_modules/@deepseek-ai/'+name+'/lib/client.js','utf8'),{window:{__ModuleLoader__:{load:value=>descriptor=value}},AbortController,AbortSignal,queueMicrotask,setTimeout,clearTimeout,console,crypto});return descriptor.factory(id=>deps[id]??fake)}
 const rt=await load('dsh-client-runtime'),native=await load('dsh-client-ui-conversation',{'@deepseek-ai/dsh-client-runtime/client':rt})
 const sent=[],calls=[],observers=new Set(),states=new Map(),removed=new Map();let actual='central',ordinary=true,prepareGate,resolvePrepare,mutationGate,resolveMutation,deferResponse=false,completion='pending',serialized='原附件快照',serializations=0,actualInput
 const emit=value=>{for(const fn of observers)fn([value])},ok=value=>({ok:true,value})
 const shell=new native.SessionInputShell({actx:{},defaultSink(text,images,mode){sent.push({text,images,mode});const rpcId='real-rpc-'+sent.length;emit({type:'client-request',method:'session.prompt',rpcId,payload:{sessionId:actual,mode,content:[{type:'text',text}]}});if(!deferResponse)emit({type:'server-response',rpcId,result:{ok:true,value:{accepted:true}}})}})
 shell.setDraft('整体要求保留📌')
 const getState=()=>{if(!states.has('a'))states.set('a',{revision:0,nextOrdinal:1,marks:[]});return states.get('a')}
 let fileVersion='b'.repeat(64)
 const stateView=()=>({...structuredClone(getState()),marks:getState().marks.map(mark=>({...structuredClone(mark),stale:mark.fileVersion!==fileVersion}))})
 const bridge={
  async open(input){calls.push(['open',input]);return ok({documentId:'a'.repeat(64),version:fileVersion,name:'原PPT.pptx',slideSize:{width:960,height:540},slides:[{index:0,part:'ppt/slides/slide7.xml',nodes:[],fields:[]}],state:stateView()})},
  async mutate(input){calls.push(['mutate',input]);if(mutationGate)await mutationGate;const state=getState();if(state.revision!==input.expectedStateRevision)return{ok:false,code:'conflict',error:'版本冲突'};for(const operation of input.operations){if(operation.op==='put'){const prior=state.marks.find(mark=>mark.id===operation.mark.id);if(prior?.fileVersion!==fileVersion&&prior)return{ok:false,code:'stale',error:'需重新定位'};if(prior)Object.assign(prior,operation.mark,{revision:prior.revision+1});else state.marks.push({...operation.mark,id:'mark-'+state.nextOrdinal,ordinal:state.nextOrdinal++,revision:1,fileVersion,stale:false})}if(operation.op==='reanchor'){const prior=state.marks.find(mark=>mark.id===operation.markId);Object.assign(prior,operation.location,{fileVersion,stale:false,revision:prior.revision+1})}if(operation.op==='remove'){removed.set(operation.markId,state.marks.find(mark=>mark.id===operation.markId));state.marks=state.marks.filter(mark=>mark.id!==operation.markId)}if(operation.op==='restore')state.marks.push(removed.get(operation.markId))}state.revision++;return ok(stateView())},
  async prepare(input){calls.push(['prepare',input]);if(prepareGate)await prepareGate;const number=calls.filter(call=>call[0]==='prepare').length;return ok({preparedId:'prepared-'+number,manifestRelativePath:'marks/manifest-'+number+'.json',documents:[{documentId:'a'.repeat(64),fileVersion:'b'.repeat(64),inputRelativePath:'marks/input.pptx',outputRelativePath:'marks/result-'+number+'.pptx',markIds:input.references.map(ref=>ref.markId)}],serializedReferences:input.references.map(value=>{const {expectedStateRevision,...reference}=value;return{reference,text:'PPT修改资料：`marks/manifest-'+number+'.json` 标记'+reference.markId}})})},
  async bindSubmission(input){calls.push(['bind',input]);return ok({status:'bound',submissionId:input.submissionId,userMessageId:'user-1',userSeq:10,turn:3,step:5})},
  async complete(input){calls.push(['complete',input]);return ok({status:completion,documents:[]})},async cancel(input){calls.push(['cancel',input]);return ok({cancelled:true})}
 }
 let identity={sessionId:'central',shell,ordinary:true};const coordinator=createPptxAnnotationCoordinator({bridge,resolveInput:async()=>{if(!ordinary)throw Error('ordinary input unavailable');return identity},isCurrent:value=>value.sessionId===actual&&value.input===actualInput,isComposing:value=>!!value?.input?.composing,subscribeEnvelopes:fn=>{observers.add(fn);return()=>observers.delete(fn)},ensureSkill:async()=>{},serializeReference:async()=>{serializations++;return serialized},newId:()=>crypto.randomUUID()})
 const source={sessionId:'central',source:{kind:'workspace',relativePath:'原PPT.pptx'}},location={slideIndex:0,slidePart:'ppt/slides/slide7.xml',kind:'point',region:{x:.4,y:.6},nodeIds:[]}
 return{coordinator,shell,bridge,calls,sent,source,location,emit,state:getState,setVersion:value=>fileVersion=value,setSerialized:value=>serialized=value,getSerializations:()=>serializations,setInput(value){actualInput=value;identity={...identity,input:value};coordinator.adoptInput(identity)},setCompletion:value=>completion=value,setCurrent:id=>actual=id,setOrdinary:value=>ordinary=value,deferPrepare(){prepareGate=new Promise(resolve=>resolvePrepare=resolve);return()=>resolvePrepare()},deferMutation(){mutationGate=new Promise(resolve=>resolveMutation=resolve);return()=>resolveMutation()},deferResponse(){deferResponse=true}}
}
it('uses the actual native identity and creates Main-owned marks with immediate native tags',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'})
 await handle.add(f.location);await handle.add({...f.location,region:{x:.2,y:.3}})
 expect(f.calls[0][1].sessionId).toBe('central');expect(handle.getSnapshot().marks.map(mark=>[mark.ordinal,mark.referenced])).toEqual([[1,true],[2,true]])
 expect(f.shell.snapshot.draft.startsWith('整体要求保留📌')).toBe(true);expect(f.shell.snapshot.occurrences).toHaveLength(2)
 const seq=handle.getSnapshot().revealSeq;handle.select('mark-1');handle.select('mark-1');expect(handle.getSnapshot().revealSeq).toBe(seq+2)
 handle.dispose();expect(f.shell.snapshot.occurrences).toHaveLength(2);f.coordinator.dispose()
})
it('serializes simultaneous adds and submits without duplicate pins, prepares or prompts',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await Promise.all([handle.add(f.location),handle.add(f.location)])
 expect(handle.getSnapshot().marks.map(mark=>mark.ordinal)).toEqual([1,2]);expect(f.shell.snapshot.occurrences).toHaveLength(2)
 await Promise.all([f.coordinator.submit(f.shell),f.coordinator.submit(f.shell)]);await f.coordinator.whenIdle()
 expect(f.calls.filter(call=>call[0]==='prepare')).toHaveLength(1);expect(f.sent).toHaveLength(1);f.coordinator.dispose()
})
it('refreshes the authoritative whole-document state after viewer disposal before one batch prepare',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);handle.dispose();f.state().revision+=4
 await f.coordinator.submit(f.shell);await f.coordinator.whenIdle();expect(f.calls.filter(call=>call[0]==='open')).toHaveLength(2);expect(f.calls.find(call=>call[0]==='prepare')[1].references[0].expectedStateRevision).toBe(5);f.coordinator.dispose()
})
it('never blindly sends a second prompt while the first RPC acknowledgement is uncertain',async()=>{
 const f=await fixture();f.deferResponse();const handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);await f.coordinator.submit(f.shell)
 await expect(f.coordinator.submit(f.shell)).rejects.toThrow(/回执|提交/);expect(f.sent).toHaveLength(1);f.coordinator.dispose()
})
it('explicitly retries a verified failed result using its frozen snapshot and fresh output allocation while preserving newer text',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add({...f.location,comment:'当时的冻结意见'});await f.coordinator.submit(f.shell);await f.coordinator.whenIdle();f.shell.setDraft('用户较新的独立草稿');f.state().marks[0].comment='后来另改的意见';f.setCompletion('failed')
 const result=await f.coordinator.retry('prepared-1');await f.coordinator.whenIdle();expect(result.preparedId).toBe('prepared-2');expect(f.calls.filter(call=>call[0]==='prepare')[1][1].retryOfPreparedId).toBe('prepared-1');expect(f.sent[1].text).toContain('当时的冻结意见');expect(f.sent[1].text).not.toContain('后来另改');expect(f.sent[1].text).toContain('marks/manifest-2.json');expect(f.shell.snapshot.draft).toBe('用户较新的独立草稿');f.coordinator.dispose()
})
it('does not retry a pending or successful real submission as an automatic duplicate',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);await f.coordinator.submit(f.shell);await f.coordinator.whenIdle();await expect(f.coordinator.retry('prepared-1')).rejects.toThrow(/未失败|实际交付/);expect(f.sent).toHaveLength(1);f.setCompletion('success');await expect(f.coordinator.retry('prepared-1')).rejects.toThrow(/未失败|实际交付/);expect(f.sent).toHaveLength(1);f.coordinator.dispose()
})
it('reuses the original foreign-reference serialized snapshot instead of reading later attachment or component content on retry',async()=>{
 const f=await fixture();f.shell.insertReference({source:'foreign-component',ref:'foreign-ref',label:'原组件',clipboardText:'原组件'},{start:0,end:0,draftRev:f.shell.snapshot.draftRev});const handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);await f.coordinator.submit(f.shell);await f.coordinator.whenIdle();f.setCompletion('failed');f.setSerialized('后来改变的组件内容');await f.coordinator.retry('prepared-1');await f.coordinator.whenIdle();expect(f.sent[1].text).toContain('原附件快照');expect(f.sent[1].text).not.toContain('后来改变');expect(f.getSerializations()).toBe(1);f.coordinator.dispose()
})
it('renews a successfully reauthorized canonical source before refreshing its state for send',async()=>{
 const f=await fixture(),open=f.bridge.open;let revoked=false;f.bridge.open=input=>revoked&&input.source.authorizationId==='old'?Promise.resolve({ok:false,error:'旧授权已撤销',code:'forbidden'}):open(input)
 const source={sessionId:'central',source:{kind:'research',authorizationId:'old',nodeId:'node'}};const first=await f.coordinator.open(source,{viewerKey:'old'});await first.add(f.location);revoked=true;first.dispose();await f.coordinator.open({...source,source:{...source.source,authorizationId:'renewed'}},{viewerKey:'new'});await f.coordinator.submit(f.shell);await f.coordinator.whenIdle();expect(f.calls.filter(call=>call[0]==='open').at(-1)[1].source.authorizationId).toBe('renewed');expect(f.sent).toHaveLength(1);f.coordinator.dispose()
})
it('rebinds a remounted ordinary textarea for composition without reviving an old viewer handle',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'old'});await handle.add(f.location);const input={composing:true};f.setInput(input);expect(handle.getSnapshot().active).toBe(false);const binding=f.coordinator.getShellBinding(f.shell),range=binding.ranges()[0];binding.setSelection({start:range.start,end:range.end});f.shell.insertText('中文',{start:range.start,end:range.end,draftRev:f.shell.snapshot.draftRev});expect(f.state().marks[0].comment).toBe('');input.composing=false;binding.flush();await f.coordinator.whenIdle();expect(f.state().marks[0].comment).toBe('中文');await expect(handle.updateComment('mark-1','过期视图')).rejects.toThrow();expect(f.shell.snapshot.draft).toContain('中文');f.coordinator.dispose()
})
it('keeps scene identity stable while bidirectional remarks persist and native tag deletion leaves the pin',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location)
 const scene=handle.getSnapshot().scene;await handle.updateComment('mark-1','右侧意见\n第二行')
 expect(handle.getSnapshot().scene).toBe(scene);expect(f.shell.snapshot.draft).toContain('右侧意见\n第二行')
 const binding=f.coordinator.getShellBinding(f.shell),range=binding.ranges()[0];binding.setSelection({start:range.start,end:range.end});f.shell.insertText('中央改写',{start:range.start,end:range.end,draftRev:f.shell.snapshot.draftRev});await f.coordinator.whenIdle()
 expect(handle.getSnapshot().marks[0].comment).toBe('中央改写');binding.remove(binding.ranges()[0].key)
 expect(handle.getSnapshot().marks[0].referenced).toBe(false);expect(handle.getSnapshot().marks).toHaveLength(1)
 f.shell.undo();expect(handle.getSnapshot().marks[0].referenced).toBe(true);f.coordinator.dispose()
})
it('reanchors an existing native tag without losing a newer rejected remark, foreign refs or its single undo history',async()=>{
 const f=await fixture();f.shell.insertReference({source:'chat-file',ref:'foreign',label:'原附件',clipboardText:'原附件'},{start:0,end:0,draftRev:f.shell.snapshot.draftRev});let handle=await f.coordinator.open(f.source,{viewerKey:'old'});await handle.add({...f.location,comment:'已存旧备注'});handle.dispose();f.setVersion('c'.repeat(64));handle=await f.coordinator.open(f.source,{viewerKey:'current'})
 const binding=f.coordinator.getShellBinding(f.shell);let range=binding.ranges()[0];binding.setSelection({start:range.start,end:range.end});f.shell.insertText('中央较新📈\n备注',{start:range.start,end:range.end,draftRev:f.shell.snapshot.draftRev});await f.coordinator.whenIdle();expect(f.state().marks[0].comment).toBe('已存旧备注')
 const before=f.shell.snapshot;await handle.reanchor('mark-1',{...f.location,region:{x:.2,y:.3}});await f.coordinator.whenIdle()
 expect(f.shell.snapshot.draft).toBe(before.draft);expect(f.shell.snapshot.draftRev).toBe(before.draftRev);expect(f.shell.snapshot.occurrences.map(value=>value.occurrenceId)).toEqual(before.occurrences.map(value=>value.occurrenceId));expect(f.state().marks[0].comment).toBe('中央较新📈\n备注');expect(f.state().marks[0].ordinal).toBe(1);expect(JSON.parse(f.shell.snapshot.occurrences[1].ref).fileVersion).toBe('c'.repeat(64))
 f.shell.undo();await f.coordinator.whenIdle();expect(binding.ranges()[0].comment).toBe('已存旧备注');expect(JSON.parse(f.shell.snapshot.occurrences[1].ref).fileVersion).toBe('c'.repeat(64));f.shell.redo();await f.coordinator.whenIdle();expect(binding.ranges()[0].comment).toBe('中央较新📈\n备注');expect(f.shell.snapshot.occurrences[0].ref).toBe('foreign')
 await f.coordinator.submit(f.shell);expect(f.calls.find(call=>call[0]==='prepare')[1].references[0].fileVersion).toBe('c'.repeat(64));expect(f.sent[0].text).toContain('中央较新📈\n备注');f.coordinator.dispose()
})
it('keeps a later native remark written while reanchor is pending and persists it with the fresh document CAS',async()=>{
 const f=await fixture();let handle=await f.coordinator.open(f.source,{viewerKey:'old'});await handle.add({...f.location,comment:'旧备注'});handle.dispose();f.setVersion('c'.repeat(64));handle=await f.coordinator.open(f.source,{viewerKey:'new'});const release=f.deferMutation(),pending=handle.reanchor('mark-1',f.location)
 await expect.poll(()=>f.calls.some(([type,input])=>type==='mutate'&&input.operations.some(value=>value.op==='reanchor'))).toBe(true)
 const binding=f.coordinator.getShellBinding(f.shell),range=binding.ranges()[0];binding.setSelection({start:range.start,end:range.end});f.shell.insertText('回执前更晚的📈意见',{start:range.start,end:range.end,draftRev:f.shell.snapshot.draftRev});const draft=f.shell.snapshot.draft;release();await pending;await f.coordinator.whenIdle()
 expect(f.shell.snapshot.draft).toBe(draft);expect(f.state().marks[0].comment).toBe('回执前更晚的📈意见');expect(f.calls.filter(([type,input])=>type==='mutate'&&input.operations.some(value=>value.op==='put')).at(-1)[1].version).toBe('c'.repeat(64));f.coordinator.dispose()
})
it('does not update another input owner from a late reanchor receipt',async()=>{
 const f=await fixture();let handle=await f.coordinator.open(f.source,{viewerKey:'old'});await handle.add({...f.location,comment:'保留原稿'});handle.dispose();f.setVersion('c'.repeat(64));handle=await f.coordinator.open(f.source,{viewerKey:'new'});const before=structuredClone(f.shell.snapshot),release=f.deferMutation(),pending=handle.reanchor('mark-1',f.location)
 await expect.poll(()=>f.calls.some(([type,input])=>type==='mutate'&&input.operations.some(value=>value.op==='reanchor'))).toBe(true);f.setCurrent('another-session');release();await expect(pending).rejects.toThrow();expect(f.shell.snapshot.draft).toBe(before.draft);expect(f.shell.snapshot.occurrences).toEqual(before.occurrences);f.coordinator.dispose()
})
it('writes right-side remarks to the native draft immediately and never rolls back a newer central edit on a late receipt',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add({...f.location,comment:'原意见'});const release=f.deferMutation(),pending=handle.updateComment('mark-1','右侧意见')
 expect(f.shell.snapshot.draft).toContain('右侧意见');const binding=f.coordinator.getShellBinding(f.shell),range=binding.ranges()[0],drafts=[];const off=f.shell.state.subscribe(()=>drafts.push(f.shell.snapshot.draft));binding.setSelection({start:range.start,end:range.end});f.shell.insertText('中央较新意见',{start:range.start,end:range.end,draftRev:f.shell.snapshot.draftRev});release();await pending;await f.coordinator.whenIdle()
 expect(f.shell.snapshot.draft).toContain('中央较新意见');expect(drafts.every(value=>!value.includes('右侧意见'))).toBe(true);expect(handle.getSnapshot().marks[0].comment).toBe('中央较新意见');off();f.coordinator.dispose()
})
it('prepares all references once with one current document revision and binds only the actual accepted RPC',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);await handle.add(f.location)
 const ticket=await f.coordinator.submit(f.shell,'queue');await f.coordinator.whenIdle()
 expect(f.calls.filter(call=>call[0]==='prepare')).toHaveLength(1)
 const input=f.calls.find(call=>call[0]==='prepare')[1];expect(input.references.map(ref=>ref.expectedStateRevision)).toEqual([2,2])
 expect(f.sent).toHaveLength(1);expect(f.sent[0].text).toContain('整体要求保留📌')
 expect(f.calls.find(call=>call[0]==='bind')[1]).toEqual({sendingSessionId:'central',preparedId:'prepared-1',submissionId:'real-rpc-1'})
 expect(ticket.preparedId).toBe('prepared-1');f.coordinator.dispose()
})
it('reads only the frozen visible draft for the exact real prepared submission without inventing a durable seq',async()=>{
 const f=await fixture();f.deferResponse();const handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add({...f.location,comment:'冻结意见📈\n第二行'});await f.coordinator.submit(f.shell)
 const input={sessionId:'central',shell:f.shell,submissionId:'real-rpc-1',text:f.sent[0].text}
 const proof=f.coordinator.pendingMessagePresentation?.(input)
 expect(proof?.parts.filter(part=>part.kind==='pptx-annotation').map(part=>[part.ordinal,part.label])).toEqual([[1,'第1页 · 位置']])
 expect(proof.parts.filter(part=>part.kind==='text').map(part=>part.text).join('')).toBe('整体要求保留📌\n 冻结意见📈\n第二行')
 expect(proof).not.toHaveProperty('userSeq');expect(proof.text).toBe(f.sent[0].text)
 f.state().marks[0].ordinal=99;f.state().marks[0].comment='后来改变的意见';proof.parts[0].text='外部修改返回对象'
 expect(f.coordinator.pendingMessagePresentation(input).parts.filter(part=>part.kind==='pptx-annotation')[0].ordinal).toBe(1)
 for(const changed of [{sessionId:'other'},{shell:{}},{submissionId:'another-rpc'},{text:input.text+' changed'}])expect(f.coordinator.pendingMessagePresentation({...input,...changed})).toBeNull()
 f.setCurrent('another-session');expect(f.coordinator.pendingMessagePresentation(input)).toBeNull();f.coordinator.dispose()
})
it('keeps the root-owned submission association after the viewer closes and ignores unrelated responses',async()=>{
 const f=await fixture();f.deferResponse();const handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location)
 await f.coordinator.submit(f.shell,'queue');handle.dispose()
 f.emit({type:'server-response',rpcId:'unrelated-rpc',result:{ok:true,value:{accepted:true}}});await f.coordinator.whenIdle();expect(f.calls.some(call=>call[0]==='bind')).toBe(false)
 f.emit({type:'server-response',rpcId:'real-rpc-1',result:{ok:true,value:{accepted:true}}});await f.coordinator.whenIdle();expect(f.calls.filter(call=>call[0]==='bind')).toHaveLength(1);f.coordinator.dispose()
})
it('rejects a changed draft after prepare and never invokes the native sink or clears newer text',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);const release=f.deferPrepare(),pending=f.coordinator.submit(f.shell,'queue')
 await expect.poll(()=>f.calls.some(call=>call[0]==='prepare')).toBe(true);f.shell.setDraft(f.shell.snapshot.draft+'用户新写');release()
 await expect(pending).rejects.toThrow('草稿');expect(f.sent).toEqual([]);expect(f.shell.snapshot.draft).toContain('用户新写');expect(f.calls.some(call=>call[0]==='cancel')).toBe(true);f.coordinator.dispose()
})
it('does not commit a frozen send when IME starts during prepare before the canonical draft has changed',async()=>{
 const f=await fixture(),handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);const input={composing:false};f.setInput(input);const release=f.deferPrepare(),pending=f.coordinator.submit(f.shell)
 await expect.poll(()=>f.calls.some(call=>call[0]==='prepare')).toBe(true);input.composing=true;release();await expect(pending).rejects.toThrow(/输入法/);expect(f.sent).toEqual([]);expect(f.shell.snapshot.occurrences).toHaveLength(1);f.coordinator.dispose()
})
it('refuses a workspace source from another session and rejects late viewer mutations after navigation',async()=>{
 const f=await fixture();await expect(f.coordinator.open({...f.source,sessionId:'other'},{viewerKey:'bad'})).rejects.toThrow('会话')
 const handle=await f.coordinator.open(f.source,{viewerKey:'viewer'});await handle.add(f.location);const before=f.shell.snapshot.draft;f.setCurrent('other')
 await expect(handle.updateComment('mark-1','晚到')).rejects.toThrow();expect(f.shell.snapshot.draft).toBe(before);f.coordinator.dispose()
})
