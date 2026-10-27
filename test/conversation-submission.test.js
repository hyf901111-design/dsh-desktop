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
it.each(['other','nonblank','subagent','disposed'])('does not project %s owner content',kind=>{
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
 const script=`import{readFileSync}from'node:fs';import{Script}from'node:vm';import assert from'node:assert/strict';import{patchConversationSubmission as patch,stripConversationSubmission as strip}from'./scripts/lib/conversation-submission.mjs';const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),one=patch(raw);assert.equal(patch(one),one);assert.equal(strip(one),raw);new Script(one);assert.throws(()=>strip(one+'\\nNativeConversationSubmissions;'));assert.throws(()=>strip(one.replace('function useNativeConversationSubmission','function invalidNativeHook')));assert.throws(()=>patch(raw+'\\nNativeConversationSubmittedUser;'));assert.throws(()=>strip(one.replace('/* sherlock:conversation-submission:v1 */','/* sherlock:conversation-submission:v1 */ /* sherlock:conversation-submission:v1 */')));console.log('strict two-pass/inverse/parse passed')`
 expect(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:8*1024*1024})).toContain('strict two-pass/inverse/parse passed')
})
it('invalidates quietly when an actual session binding disappears during lifecycle teardown',()=>{
 const f=fixture();f.emit(f.request());f.deps.sessions.binding=()=>{throw Error('scope removed')}
 expect(()=>f.setState({removed:true})).not.toThrow();expect(f.store.read('a')).toBeNull();f.stop()
})
it('unwinds the installed transient layers before existing strict Home/PPT fixture normalization',()=>{
 const script=`import{readFileSync}from'node:fs';import assert from'node:assert/strict';import{patchConversationSubmission}from'./scripts/lib/conversation-submission.mjs';import{patchConversationResponseProgress}from'./scripts/lib/conversation-response-progress.mjs';import{stripConversationTransientUi}from'./test/fixtures/strip-conversation-transient-ui.mjs';import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';import{stripPlainSlashInput}from'./scripts/lib/plain-slash-input.mjs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';import{stripHomeGuidePresentationNative}from'./scripts/lib/home-guide-presentation-native.mjs';const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),one=patchConversationResponseProgress(patchConversationSubmission(raw)),legacy=source=>stripHomeGuidePresentationNative(stripPptxAnnotationInput(stripPptxAnnotationMessages(stripSidebarNewNoteConversation(stripPlainSlashInput(source)))));assert.throws(()=>legacy(one));assert.equal(legacy(stripConversationTransientUi(one)),legacy(raw));console.log('installed outer layers normalized, original legacy guards unchanged')`
 expect(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',maxBuffer:8*1024*1024})).toContain('original legacy guards unchanged')
})
