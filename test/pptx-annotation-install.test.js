import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync,execFileSync} from 'node:child_process'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {expect,it} from 'vitest'
const file='node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',resident=readFileSync(file,'utf8')
// Use the production Node loader: Vite reformats Function.toString source bytes.
const patch=(value,strip=false)=>{const child=spawnSync(process.execPath,['--input-type=module','-e',`import{${strip?'strip':'patch'}PptxAnnotationInput as apply}from'./scripts/lib/pptx-annotation-native.mjs';process.stdin.setEncoding('utf8');let text='';for await(const chunk of process.stdin)text+=chunk;process.stdout.write(apply(text));`],{input:value,encoding:'utf8',maxBuffer:32*1024*1024});if(child.status!==0)throw Error(child.stderr);return child.stdout}
// A full pipeline may already have installed the coordinator in the resident module.
const source=patch(resident,true)
it('strictly installs once, strips exactly and rejects native hook, definition, duplicate and unknown marker drift',()=>{
 const result=patch(source);expect(patch(resident)).toBe(result);expect(patch(result)).toBe(result);expect(patch(result,true)).toBe(source)
 expect(()=>patch(source.replace('sinkSerialized(draft, mode) {','sinkSerialized(draftV2, mode) {'))).toThrow(/drifted/)
 expect(()=>patch(result.replace('if(flights.has(shell))','if(flights.has(other))'))).toThrow(/drifted/)
 expect(()=>patch(result.replace('/* sherlock:pptx-annotation-input:start:v1 */','/* sherlock:pptx-annotation-input:start:v1 *//* sherlock:pptx-annotation-input:start:v1 */'))).toThrow(/drifted/)
 expect(()=>patch(result.replaceAll('sherlock:pptx-annotation-input:start:v1','sherlock:pptx-annotation-input:start:v999'))).toThrow(/drifted/)
})
it('upgrades the complete installed multiline-remark runtime to inline spacing without accepting altered legacy source',()=>{
 const current=patch(source),previous=execFileSync('git',['show','4fd41562db607e662d217c67393945acc7a664de:scripts/lib/pptx-annotation-coordinator.mjs'],{encoding:'utf8'}),coordinator=previous.slice(previous.indexOf('export function createPptxAnnotationCoordinator')).replace('export ','').trimEnd(),native=execFileSync('git',['show','4fd41562db607e662d217c67393945acc7a664de:scripts/lib/pptx-annotation-native.mjs'],{encoding:'utf8'}),runtime=native.slice(native.indexOf('export function createPptxAnnotationNativeRuntime('),native.indexOf('\nfunction PptxAnnotationNativePortal(')).replace('export ',''),prior=current.replace(/function createPptxAnnotationCoordinator\(deps\)\{[\s\S]*?\nfunction createPptxAnnotationRevealController/,()=>coordinator+'\nfunction createPptxAnnotationRevealController').replace(/function createPptxAnnotationNativeRuntime\(options\)\{[\s\S]*?\nfunction PptxAnnotationNativePortal/,()=>runtime+'\nfunction PptxAnnotationNativePortal'),legacy=prior.replace(/function annotationBlock\(before,comment\)\{[\s\S]*?\n\}/,String.raw`function annotationBlock(before,comment){
 if(typeof before!=='string'||typeof comment!=='string')throw Error('标注文本无效。')
 const prefix=before?(before.endsWith('\n')?'\n':'\n\n'):'',token='@pptx',tagOffset=prefix.length,start=tagOffset+2
 return {text:prefix+token+'\n'+comment+'\n\n',inserted:prefix+'\uFFFC\n'+comment+'\n\n',componentStart:tagOffset,componentEnd:tagOffset+token.length,tagOffset,start,end:start+comment.length}
}`).replace(/function augmentAnnotationDeletion\(before,next,ranges,selection\)\{[\s\S]*?\n\}/,String.raw`function augmentAnnotationDeletion(before,next,ranges,selection){
 const edit=annotationEdit(before,next,selection),removed=ranges.filter(range=>annotationRangeValid(before,range)&&edit.start<=range.tagOffset&&edit.end>range.tagOffset)
 if(!removed.length)return {draft:next,removed:[],editRange:{start:edit.start,end:edit.end,insertedLength:edit.text.length}}
 const start=Math.min(edit.start,...removed.map(range=>range.blockStart)),end=Math.max(edit.end,...removed.map(range=>range.blockEnd))
 return {draft:before.slice(0,start)+edit.text+before.slice(end),removed:removed.map(range=>range.key),editRange:{start,end,insertedLength:edit.text.length}}
}`).replace('trackAnnotationRanges(before.draft,expanded.draft,ranges,expanded.removed?.length?expanded.editRange:captured)','trackAnnotationRanges(before.draft,expanded.draft,ranges,captured)').replace('  if(expanded.retainedSeparator){const next=tracked.ranges.find(range=>range.key===expanded.retainedSeparator.key);if(next)next.blockStart=expanded.retainedSeparator.start}\n','')
 const begin=legacy.indexOf('\n/* sherlock:pptx-annotation-input:start:v1 */'),end=legacy.indexOf('/* sherlock:pptx-annotation-input:end:v1 */',begin)+'/* sherlock:pptx-annotation-input:end:v1 */'.length+1
 expect(createHash('sha256').update(legacy.slice(begin,end)).digest('hex')).toBe('4aeef32cf0bb0c909e8a9d8a85c877211d5d1873b290c36781d2b9ae0b981a2b')
 expect(legacy.includes("inserted:prefix+'\\uFFFC\\n'+comment+'\\n\\n'")).toBe(true)
 expect(current.includes("inserted:prefix+'\\uFFFC '+comment+'\\n'")).toBe(true)
 expect(patch(legacy)).toBe(current);expect(patch(legacy,true)).toBe(source);expect(patch(current)).toBe(current);expect(patch(current,true)).toBe(source)
 expect(()=>patch(legacy.replace("inserted:prefix+'\\uFFFC\\n'+comment+'\\n\\n'","inserted:prefix+'\\uFFFC\\n'+comment+'\\n'"))).toThrow(/drifted/)
})
it('upgrades only the exact previous notice implementation and keeps legacy drift rejected',()=>{
 const current=patch(source),legacy=current.replace(',submissionNotices=new WeakMap()','').replace(/  interceptSend\(shell,draft,mode\)\{[\s\S]*?\n  getSubmissions:/,"  interceptSend(shell,draft,mode){if(!shell.snapshot.occurrences.some(value=>value.source==='pptx-annotation'))return false;watch(submit(shell,mode).catch(reason=>shell.notify('error',error(reason).message)));return true},\n  getSubmissions:")
 expect(legacy).not.toBe(current);expect(legacy).not.toContain('submissionNotices');expect(patch(legacy,true)).toBe(source);expect(patch(legacy)).toBe(current);expect(patch(patch(legacy))).toBe(current)
 expect(()=>patch(legacy.replace("shell.notify('error',error(reason).message)","shell.notify('error','drifted')"))).toThrow(/drifted/)
 expect(()=>patch(legacy.replace('/* sherlock:pptx-annotation-input:start:v1 */','/* sherlock:pptx-annotation-input:start:v1 *//* sherlock:pptx-annotation-input:start:v1 */'))).toThrow(/drifted/)
})
async function fixture(){
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});const win=new Window({url:'https://native.local'}),descriptors=[];win.__ModuleLoader__={load:descriptor=>descriptors.push(descriptor)}
 const load=(name,text=readFileSync('node_modules/@deepseek-ai/'+name+'/lib/client.js','utf8'),deps={})=>{runInNewContext(text,{window:win,AbortController,AbortSignal,DOMException,queueMicrotask,setTimeout,clearTimeout,console,crypto,Response,URL});return descriptors.at(-1).factory(id=>deps[id]??fake)}
 const runtime=load('dsh-client-runtime'),connection=load('dsh-client-connection'),native=load('dsh-client-ui-conversation',patch(source).replace('exports.apply = apply;','exports.apply = apply;exports.__InputHub=InputHub;exports.__Conversation=ConversationController;'),{'@deepseek-ai/dsh-client-runtime/client':runtime})
 const requests=[],envelopes=[];let reject=false,late
 class Api extends connection.AbstractApiClient{async doFetch(path,init){const request=JSON.parse(init.body);requests.push({path:path.pathname,request});if(late)await late;return new Response(JSON.stringify({type:'server-response',rpcId:request.rpcId,result:reject?{ok:false,error:{code:'internal',message:'拒绝提交'}}:{ok:true,value:{accepted:true}}}),{status:200,headers:{'content-type':'application/json'}})}}
 const api=new Api();api.subscribeEnvelopes(batch=>envelopes.push(...batch));const context={get:()=>undefined,reflect:{provide(){}},effect:fn=>fn()??(()=>{})},sessions=new runtime.SessionRuntime(context,api,{}),session=sessions.manager.get('central');session.openState='open';session.installWindow([],false)
 const effects=[],actx={on:()=>()=>{},get:()=>undefined,effect:fn=>{const off=fn();if(off)effects.push(off);return()=>{}}},conversation={draftImages:()=>[],serializeImages:async()=>[],releaseDraftImages(){},sendSession:native.__Conversation.prototype.sendSession},rootCtx={get:name=>name==='conversation'?conversation:name==='inputTriggers'?{sessionOf:()=>({serializeReference:async()=>'/native-skill'})}:undefined}
 const hub=new native.__InputHub(rootCtx,value=>value,{for:()=>({getSnapshot:()=>({files:[],artifacts:[]})})}),shell=hub.shellFor({sessionId:'central',session,ctx:actx});shell.setDraft('冻结旧稿')
 return{win,native,api,session,shell,hub,requests,envelopes,effects,reject(){reject=true},defer(){let release;late=new Promise(resolve=>release=resolve);return()=>release()}}
}
it('executes the patched native default sink through real InputHub, Session.prompt and ApiClient envelopes without clearing a newer retry draft',async()=>{
 const f=await fixture(),before={...f.shell.snapshot,occurrences:[],imageIds:[],pptxAnnotation:true};f.shell.setDraft('用户后写的新稿')
 await f.shell.deps.defaultSink('已冻结修改资料 `marks/manifest.json`',[],'queue',before)
 expect(f.shell.notices.getSnapshot()).toEqual(null);expect(f.session.getSnapshot().promptError).toEqual(null)
 expect(f.shell.snapshot.draft).toBe('用户后写的新稿');expect(f.requests).toHaveLength(1);expect(f.requests[0].path).toBe('/api/session.prompt');expect(f.requests[0].request.payload.sessionId).toBe('central');expect(f.requests[0].request.payload.content[0].text).toContain('marks/manifest.json')
 await Promise.resolve();expect(f.envelopes.map(value=>value.type)).toEqual(['client-request','server-response']);expect(f.envelopes[0].rpcId).toBe(f.envelopes[1].rpcId)
})
it('routes annotated sends to one coordinator intercept while the ordinary native serializer stays unchanged',async()=>{
 const f=await fixture(),calls=[];f.win[Symbol.for('sherlock:pptx-annotation-input')]={interceptSend:(shell,draft,mode)=>{calls.push([shell,draft,mode]);return draft==='标注草稿'}}
 f.shell.sinkSerialized('标注草稿','queue');expect(f.requests).toEqual([]);expect(calls[0][0]).toBe(f.shell)
 f.shell.sinkSerialized('普通输入','queue');await expect.poll(()=>f.requests.length).toBe(1);expect(f.requests[0].request.payload.content[0].text).toBe('普通输入')
})
