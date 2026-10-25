import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
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
