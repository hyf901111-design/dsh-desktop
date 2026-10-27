import {afterEach,expect,it} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {runInNewContext} from 'node:vm'
import {fixture as pptxFixture} from './fixtures/pptx'
import {PptxArchive} from '../src/main/pptx/archive'
import {PptxAnnotationService} from '../src/main/pptx/annotations'
import {createPptxAnnotationCoordinator} from '../scripts/lib/pptx-annotation-coordinator.mjs'
const cleanups=[];afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()})
async function setup(){
 const root=await mkdtemp(path.join(tmpdir(),'ppt-live-numbering-')),workspace=path.join(root,'workspace');await mkdir(workspace)
 const archive=new PptxArchive(pptxFixture()),bytes=archive.replace(new Map([['ppt/presentation.xml',Buffer.from(archive.read('ppt/presentation.xml').toString().replace('</p:presentation>','<p:sldSz cx="12192000" cy="6858000"/></p:presentation>'))]]));await writeFile(path.join(workspace,'deck.pptx'),bytes)
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const load=async(name,deps={})=>{let descriptor;const window=Object.assign(new EventTarget(),{__ModuleLoader__:{load:value=>descriptor=value}});runInNewContext(await readFile('node_modules/@deepseek-ai/'+name+'/lib/client.js','utf8'),{window,AbortController,AbortSignal,DOMException,queueMicrotask,setTimeout,clearTimeout,console,crypto,Response,URL});return descriptor.factory(id=>deps[id]??fake)}
 const runtime=await load('dsh-client-runtime'),connection=await load('dsh-client-connection'),native=await load('dsh-client-ui-conversation',{'@deepseek-ai/dsh-client-runtime/client':runtime}),requests=[]
 class Api extends connection.AbstractApiClient{async doFetch(_url,init){const request=JSON.parse(init.body);requests.push(request);return new Response(JSON.stringify({type:'server-response',rpcId:request.rpcId,result:{ok:true,value:{accepted:true}}}),{status:200,headers:{'content-type':'application/json'}})}}
 const api=new Api(),ctx={get:()=>undefined,reflect:{provide(){}},effect:start=>start()??(()=>{})},sessions=new runtime.SessionRuntime(ctx,api,{}),session=sessions.manager.get('central');session.openState='open';session.installWindow([],false)
 const shell=new native.SessionInputShell({actx:{},defaultSink:(text,_images,mode)=>session.prompt([{type:'text',text}],mode)});shell.setDraft('整体要求📌保持原文与所有其他引用。')
 const options={root:path.join(root,'state'),owner:()=> 'qa-owner',resolveWorkspace:async id=>id==='central'?workspace:null,resolveAuthorizedSource:async()=>null,readHistory:async()=>({events:[],hasMore:false})},service=new PptxAnnotationService(options),identity={sessionId:'central',shell,ordinary:true},source={sessionId:'central',source:{kind:'workspace',relativePath:'deck.pptx'}}
 const coordinator=createPptxAnnotationCoordinator({bridge:service,resolveInput:async()=>identity,isCurrent:value=>value===identity,subscribeEnvelopes:fn=>api.subscribeEnvelopes(fn),serializeReference:async()=> '原附件内容不变'}),handle=await coordinator.open(source,{viewerKey:'first'})
 const location={slideIndex:0,slidePart:handle.getSnapshot().scene.slides[0].part,kind:'point',region:{x:.2,y:.3},nodeIds:[]}
 const close=async()=>{coordinator.dispose();shell.dispose();await rm(root,{recursive:true,force:true})};cleanups.push(close)
 return{root,workspace,bytes,options,service,shell,identity,source,coordinator,handle,requests,location,async add(count){for(let i=0;i<count;i++)await handle.add({...location,region:{x:.2+i*.1,y:.3},comment:'独立意见'+(i+1)+'📈'})}}
}
it.each([0,1,2])('renumbers the live marks after deleting index %s without rewriting Main ids or historical ordinals',async index=>{
 const f=await setup();await f.add(3);const before=f.handle.getSnapshot(),removed=before.marks[index],survivors=before.marks.filter(mark=>mark.id!==removed.id)
 await f.handle.remove(removed.id);const live=f.handle.getSnapshot().marks
 expect(live.map(mark=>mark.ordinal)).toEqual([1,2]);expect(live.map(mark=>mark.id)).toEqual(survivors.map(mark=>mark.id));expect(live.map(mark=>mark.canonicalOrdinal)).toEqual(survivors.map(mark=>mark.ordinal))
 const raw=(await f.service.open(f.source)).value.state;expect(raw.marks.map(mark=>[mark.id,mark.ordinal,mark.comment])).toEqual(survivors.map(mark=>[mark.id,mark.ordinal,mark.comment]));expect(raw.nextOrdinal).toBe(4)
 expect(f.shell.snapshot.draft).toContain('整体要求📌保持原文与所有其他引用。');expect(f.shell.snapshot.draft).not.toContain(removed.comment)
 for(const mark of live){const occurrence=f.shell.snapshot.occurrences.find(ref=>JSON.parse(ref.ref).markId===mark.id);expect(f.coordinator.referenceInfo(occurrence.ref).ordinal).toBe(mark.ordinal);expect(JSON.parse(occurrence.ref).documentId).toBe(before.basis.documentId)}
 await f.handle.add({...f.location,comment:'新加的一处'});expect(f.handle.getSnapshot().marks.map(mark=>mark.ordinal)).toEqual([1,2,3]);expect(f.handle.getSnapshot().marks.at(-1).canonicalOrdinal).toBe(4)
 expect(await readFile(path.join(f.workspace,'deck.pptx'))).toEqual(f.bytes)
})
it('starts live numbering at one after every old mark is deleted while keeping Main nextOrdinal monotonic',async()=>{
 const f=await setup();await f.add(3);for(const mark of f.handle.getSnapshot().marks)await f.handle.remove(mark.id)
 expect(f.handle.getSnapshot().marks).toEqual([]);await f.handle.add({...f.location,comment:'全部删除后重新标注'})
 expect(f.handle.getSnapshot().marks.map(mark=>[mark.ordinal,mark.canonicalOrdinal])).toEqual([[1,4]]);expect((await f.service.open(f.source)).value.state.nextOrdinal).toBe(5)
})
it('shares live numbering between views and reconstructs it from persisted Main state on reopen',async()=>{
 const f=await setup();await f.add(2);const second=await f.coordinator.open(f.source,{viewerKey:'second'}),[first,remaining]=f.handle.getSnapshot().marks;await second.remove(first.id)
 expect(f.handle.getSnapshot().marks.map(mark=>[mark.id,mark.ordinal])).toEqual([[remaining.id,1]]);expect(second.getSnapshot().marks[0].ordinal).toBe(1);f.coordinator.dispose()
 const service=new PptxAnnotationService(f.options),coordinator=createPptxAnnotationCoordinator({bridge:service,resolveInput:async()=>f.identity,isCurrent:()=>true}),reopened=await coordinator.open(f.source,{viewerKey:'reopened'});cleanups.push(()=>coordinator.dispose())
 expect(reopened.getSnapshot().marks.map(mark=>[mark.id,mark.ordinal,mark.canonicalOrdinal,mark.comment])).toEqual([[remaining.id,1,2,remaining.comment]])
 expect((await service.open(f.source)).value.state.marks[0].ordinal).toBe(2)
})
it('keeps the canonical serialized target while freezing the live display ordinal for its actual native RPC',async()=>{
 const f=await setup();await f.add(3);const [first]=f.handle.getSnapshot().marks;await f.handle.remove(first.id);const before=f.handle.getSnapshot().marks
 const prepared=await f.coordinator.submit(f.shell);await f.coordinator.whenIdle();const request=f.requests.find(value=>value.method==='session.prompt'),text=request.payload.content[0].text
 expect(before.map(mark=>mark.ordinal)).toEqual([1,2]);expect(prepared.serializedReferences.map(value=>value.reference.markId)).toEqual(before.map(mark=>mark.id));expect(text).toContain('[PPT 标注 2 · 第 1 页]');expect(text).toContain('[PPT 标注 3 · 第 1 页]')
 const view=f.coordinator.pendingMessagePresentation({sessionId:'central',shell:f.shell,submissionId:request.rpcId,text});expect(view.parts.filter(part=>part.kind==='pptx-annotation').map(part=>[part.reference.markId,part.ordinal,part.canonicalOrdinal])).toEqual(before.map(mark=>[mark.id,mark.ordinal,mark.canonicalOrdinal]))
 expect((await f.service.open(f.source)).value.state.marks.map(mark=>mark.ordinal)).toEqual([2,3])
})
