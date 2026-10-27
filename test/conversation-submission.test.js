import {expect,it} from 'vitest'
import {execFileSync} from 'node:child_process'
import {createNativeConversationSubmissions} from '../scripts/lib/conversation-submission.mjs'

function fixture(){
 const observers=new Set(),owners=new Set(),states=new Set(),shell={disposed:false,snapshot:{draft:'用户原稿📌'}}
 let current='a',subagent=false,snapshot={blank:true,removed:false,promptError:null}
 const session={getSnapshot:()=>snapshot,subscribe:fn=>{states.add(fn);return()=>states.delete(fn)}}
 const sessions={list:{getSnapshot:()=>({current}),subscribe:fn=>{owners.add(fn);return()=>owners.delete(fn)}},binding:()=>({session}),subagentAddress:()=>subagent?{}:undefined}
 const deps={api:{subscribeEnvelopes:fn=>{observers.add(fn);return()=>observers.delete(fn)}},sessions,inputHub:{shells:new Map([['a',shell]])}}
 const store=createNativeConversationSubmissions(),stop=store.watch(deps)
 const emit=(...batch)=>{for(const fn of observers)fn(batch)}
 const request=(rpcId='rpc-1',sessionId='a')=>({type:'client-request',method:'session.prompt',rpcId,payload:{sessionId,content:[{type:'text',text:'实际发出的完整正文📈'}]}})
 return{store,stop,deps,shell,session,observers,owners,states,emit,request,setOwner:id=>{current=id;for(const fn of owners)fn()},setState:patch=>{snapshot={...snapshot,...patch};for(const fn of states)fn()},subagent:()=>subagent=true}
}
it('projects only an observed first-send request and freezes its exact wire without mutating the composer',()=>{
 const f=fixture(),r=f.request();expect(f.store.read('a')).toBeNull();f.emit(r)
 const entry=f.store.read('a');expect(entry.rpcId).toBe(r.rpcId);expect(entry.content).toEqual(r.payload.content)
 r.payload.content[0].text='后来外部对象被改';expect(entry.content[0].text).toBe('实际发出的完整正文📈');expect(f.shell.snapshot.draft).toBe('用户原稿📌')
 f.emit(f.request(),f.request('rpc-2'));expect(f.store.read('a')).toBe(entry);f.stop()
})
it.each(['other','subagent','disposed'])('does not project %s owner content',kind=>{
 const f=fixture();if(kind==='nonblank')f.setState({blank:false});if(kind==='subagent')f.subagent();if(kind==='disposed')f.shell.disposed=true
 f.emit(f.request('rpc-1',kind==='other'?'foreign':'a'));expect(f.store.read('a')).toBeNull();expect(f.store.read('foreign')).toBeNull();f.stop()
})
it('keeps an accepted request until explicitly consumed and ignores a different response identity',()=>{
 const f=fixture();f.emit(f.request());const entry=f.store.read('a')
 f.emit({type:'server-response',rpcId:'other',result:{ok:false}});expect(f.store.read('a')).toBe(entry)
 f.emit({type:'server-response',rpcId:'rpc-1',result:{ok:true,value:{accepted:true}}});expect(f.store.read('a')).toBe(entry)
 f.store.consume({...entry});expect(f.store.read('a')).toBe(entry);f.store.consume(entry);expect(f.store.read('a')).toBeNull();expect(f.states.size).toBe(0);f.stop()
})
it.each(['server','transport','cancel','owner'])('cleans %s invalidation without modifying newer draft state',kind=>{
 const f=fixture();f.emit(f.request());f.shell.snapshot.draft='较新原稿'
 if(kind==='server')f.emit({type:'server-response',rpcId:'rpc-1',result:{ok:false,error:{code:'denied'}}})
 if(kind==='transport')f.setState({promptError:{op:'send'}})
 if(kind==='cancel')f.emit({type:'client-request',method:'session.cancel',payload:{sessionId:'a'}})
 if(kind==='owner')f.setOwner('new')
 expect(f.store.read('a')).toBeNull();expect(f.states.size).toBe(0);expect(f.shell.snapshot.draft).toBe('较新原稿');f.stop()
})
it('releases old lifecycle listeners and cannot let an old disposer clear the new owner entry',()=>{
 const f=fixture();f.emit(f.request());const stop=f.store.watch(f.deps);f.emit(f.request('rpc-2'));f.stop()
 expect(f.store.read('a').rpcId).toBe('rpc-2');expect(f.observers.size).toBe(1);stop();expect(f.store.read('a')).toBeNull();expect(f.observers.size).toBe(0);expect(f.owners.size).toBe(0);expect(f.states.size).toBe(0)
})
it('installs the actual native module twice with exact inverse and refuses drift/duplicates/orphan hooks',()=>{
 const script=`import{readFileSync}from'node:fs';import{Script}from'node:vm';import assert from'node:assert/strict';import{patchConversationSubmission as patch,stripConversationSubmission as strip}from'./scripts/lib/conversation-submission.mjs';const raw=strip(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),one=patch(raw);assert.equal(patch(one),one);assert.equal(strip(one),raw);new Script(one);assert.throws(()=>strip(one+'\\nNativeConversationSubmissions;'));assert.throws(()=>strip(one.replace('function useNativeConversationSubmission','function invalidNativeHook')));assert.throws(()=>patch(raw+'\\nNativeConversationSubmittedUser;'));assert.throws(()=>strip(one.replace('/* sherlock:conversation-submission:v3 */','/* sherlock:conversation-submission:v3 */ /* sherlock:conversation-submission:v3 */')));console.log('strict two-pass/inverse/parse passed')`
 expect(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:8*1024*1024})).toContain('strict two-pass/inverse/parse passed')
})
it('invalidates quietly when an actual session binding disappears during lifecycle teardown',()=>{
 const f=fixture();f.emit(f.request());f.deps.sessions.binding=()=>{throw Error('scope removed')}
 expect(()=>f.setState({removed:true})).not.toThrow();expect(f.store.read('a')).toBeNull();f.stop()
})
it('unwinds the installed transient layers before existing strict Home/PPT fixture normalization',()=>{
 const script=`import{readFileSync}from'node:fs';import assert from'node:assert/strict';import{patchConversationSubmission}from'./scripts/lib/conversation-submission.mjs';import{patchConversationResponseProgress}from'./scripts/lib/conversation-response-progress.mjs';import{stripConversationTransientUi}from'./test/fixtures/strip-conversation-transient-ui.mjs';import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';import{stripPlainSlashInput}from'./scripts/lib/plain-slash-input.mjs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';import{stripHomeGuidePresentationNative}from'./scripts/lib/home-guide-presentation-native.mjs';const raw=stripConversationTransientUi(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),one=patchConversationSubmission(patchConversationResponseProgress(raw)),legacy=source=>stripHomeGuidePresentationNative(stripPptxAnnotationInput(stripPptxAnnotationMessages(stripSidebarNewNoteConversation(stripPlainSlashInput(source)))));assert.throws(()=>legacy(one));assert.equal(legacy(stripConversationTransientUi(one)),legacy(raw));console.log('installed outer layers normalized, original legacy guards unchanged')`
 expect(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:8*1024*1024})).toContain('original legacy guards unchanged')
})

it('upgrades only the complete prior submission layer and preserves the exact annotation installer inverse',()=>{
 const script=`import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{Script}from'node:vm';import assert from'node:assert/strict';import{patchConversationSubmission as patch,stripConversationSubmission as strip}from'./scripts/lib/conversation-submission.mjs';import{patchPptxAnnotationInput as patchInput,stripPptxAnnotationInput as stripInput}from'./scripts/lib/pptx-annotation-native.mjs';import{patchPptxAnnotationMessages as patchMessage,stripPptxAnnotationMessages as stripMessage}from'./scripts/lib/pptx-annotation-message.mjs';const previous=await import('data:text/javascript;base64,'+execFileSync('git',['show','4fd41562db607e662d217c67393945acc7a664de:scripts/lib/conversation-submission.mjs']).toString('base64'));const raw=strip(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),old=previous.patchConversationSubmission(raw),one=patch(old);assert.equal(strip(one),raw);assert.equal(patch(one),one);new Script(one);assert.throws(()=>strip(old.replace('function createNativeConversationSubmissions(){','function createNativeConversationSubmissions(invalid){')));const input=stripInput(stripMessage(raw)),current=patchMessage(patchInput(input)),both=patch(current);assert.equal(strip(both),current);assert.equal(stripInput(stripMessage(strip(both))),input);assert.equal(patch(both),both);new Script(both);console.log('known v1 upgrade and annotation inverse passed')`
 expect(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:8*1024*1024})).toContain('known v1 upgrade and annotation inverse passed')
})

it('projects actual subsequent ordinary requests instead of requiring a blank session',()=>{const f=fixture();f.setState({blank:false,chat:{order:['old'],nodes:new Map([['old',{key:'old',kind:'user',anchorSeq:4,data:{seq:4,source:{kind:'user',rpcId:'old'}}}]]),timeline:{turns:new Map([[1,{turn:1,status:'closed'}]])}}});f.emit(f.request());expect(f.store.read('a')?.rpcId).toBe('rpc-1');f.stop()})
it('retains several exact ordinary requests in observed order with a fixed bound and per-RPC rejection',()=>{const f=fixture();f.setState({blank:false});for(let i=0;i<20;i++)f.emit(f.request('rpc-'+i));expect(f.store.all('a').map(entry=>entry.rpcId)).toEqual(Array.from({length:16},(_,i)=>'rpc-'+i));f.emit({type:'server-response',rpcId:'rpc-3',result:{ok:false,error:{code:'refused'}}});expect(f.store.all('a')).toHaveLength(15);expect(f.store.all('a').some(entry=>entry.rpcId==='rpc-3')).toBe(false);expect(f.store.read('a').rpcId).toBe('rpc-0');f.stop()})
it('hands off steering by exact RPC and advances queued successors only from the real durable turn',()=>{const f=fixture();f.setState({blank:false,chat:{order:[],nodes:new Map(),timeline:{turns:new Map([[1,{turn:1,status:'closed'}]])}}});f.emit(f.request('one'),f.request('two'));const node={key:'real-one',kind:'steering',location:{kind:'turn',turn:{turn:2}},data:{source:{kind:'user',rpcId:'one'}}};f.setState({chat:{order:[node.key],nodes:new Map([[node.key,node]]),timeline:{turns:new Map([[2,{turn:2,status:'open'}]])}}});expect(f.store.all('a')).toHaveLength(1);expect(f.store.read('a').rpcId).toBe('two');expect(f.store.read('a').barrierTurn).toBe(2);f.stop()})
it('does not remove a different accepted request for a later exact refusal or transport error',()=>{const f=fixture();f.emit(f.request('one'),f.request('two'));f.emit({type:'server-response',rpcId:'one',result:{ok:true,value:{accepted:true}}});const error={code:'denied'};f.emit({type:'server-response',rpcId:'two',result:{ok:false,error}});f.setState({promptError:{op:'send',error}});expect(f.store.read('a').rpcId).toBe('one');f.emit(f.request('three'));f.setState({promptError:{op:'send',error:{code:'transport'}}});expect(f.store.all('a').map(entry=>entry.rpcId)).toEqual(['one']);f.stop()})
it('does not recreate an already handed-off RPC from a repeated observed envelope',()=>{const f=fixture();f.emit(f.request());f.store.consume(f.store.read('a'));f.emit(f.request());expect(f.store.read('a')).toBeNull();f.stop()})
it('ignores unavailable scoped metadata during teardown without throwing from a protocol observer',()=>{const f=fixture();f.deps.sessions.subagentAddress=()=>{throw Error('scope closing')};expect(()=>f.emit(f.request())).not.toThrow();expect(f.store.read('a')).toBeNull();f.stop()})
it('strictly upgrades the complete released v2 block to the bounded v3 flow with no unrelated source change',()=>{
 const script=`import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import assert from'node:assert/strict';import{patchConversationSubmission as patch,stripConversationSubmission as strip}from'./scripts/lib/conversation-submission.mjs';const previous=await import('data:text/javascript;base64,'+execFileSync('git',['show','1ea4cf740d83271e1e15a5ee98fdf100a1128dcf:scripts/lib/conversation-submission.mjs']).toString('base64')),raw=strip(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),old=previous.patchConversationSubmission(raw),legacy=readFileSync('test/fixtures/conversation-submission-v2.txt','utf8');assert.equal(createHash('sha256').update(legacy).digest('hex'),'c823118b5dc585aae7171ea1d84cd5e234ccf7c32f768bd4f9703d69891887f2');assert.ok(old.includes(legacy));const one=patch(old);assert.equal(patch(one),one);assert.equal(strip(one),raw);assert.equal(one,patch(raw));assert.throws(()=>strip(old.replace('blank!==true','blank!==false')));console.log('released v2 strict migration and exact inverse passed')`
 expect(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:8*1024*1024})).toContain('v2 strict migration')
})
it('keeps the real predecessor turn fence when React hands off before the session observer runs',()=>{const f=fixture();f.setState({blank:false,chat:{order:[],nodes:new Map(),timeline:{turns:new Map([[1,{turn:1,status:'closed'}]])}}});f.emit(f.request('one'),f.request('two'));const entry=f.store.read('a'),node={kind:'user',location:{kind:'turn',turn:{turn:2}},data:{source:{kind:'user',rpcId:'one'}}};f.store.consume(entry,node);expect(f.store.read('a').barrierTurn).toBe(2);f.stop()})
