import {expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {runInNewContext} from 'node:vm'
import {readFile} from 'node:fs/promises'
import {patchNotesClient} from '../scripts/lib/notes-client.mjs'
import {createNotesChallengeSidebar,NotesChallengeTab,normalizeNotesChallengeEvent,patchNotesChallengeClient} from '../scripts/lib/notes-challenge-client.mjs'

const evidence={kind:'note',label:'相关原文',blockId:'original',quote:'营收为 100 亿元'}
const checks=[{kind:'consensus',status:'unavailable',detail:'infodb 暂不可用'}]
function fixture(){
 const window=new Window();const document=window.document
 const header=document.createElement('header');header.dataset.eworkNotesSession='s';document.body.append(header)
 let current='s';const sessions={list:{getSnapshot:()=>({current,byId:{s:{},other:{}}})}}
 const service={registerTab:vi.fn(()=>vi.fn()),openTab:vi.fn(),setPanelState:vi.fn(),closeTab:vi.fn()}
 const sidebar=createNotesChallengeSidebar({service,sessions,document,window})
 const send=(type,detail)=>document.dispatchEvent(new window.CustomEvent('sherlock:notes-challenge-'+type,{detail}))
 return {window,document,service,sidebar,send,switchSession:id=>{current=id;header.dataset.eworkNotesSession=id},dispose:()=>{sidebar.dispose();window.happyDOM.abort()}}
}
it('opens only explicit evidence for the current session through the existing right panel service',()=>{
 const f=fixture();try{
  f.send('state',{sessionId:'s',level:2,checks,coverage:{checked:1,total:3},issues:[]})
  expect(f.service.openTab).not.toHaveBeenCalled()
  f.send('open',{sessionId:'other',evidence:[evidence]});f.send('open',{sessionId:'s',evidence:[]})
  expect(f.service.openTab).not.toHaveBeenCalled()
  f.send('open',{sessionId:'s',threadId:'thread',quote:'原句',evidence:[evidence],checks})
  expect(f.service.openTab).toHaveBeenCalledExactlyOnceWith({id:'notes-challenge:s',type:'sherlock-notes-challenge',title:'挑战',meta:{sherlockPanel:'right'}},{sessionId:'s'})
  expect(f.service.setPanelState).toHaveBeenCalledExactlyOnceWith({open:true},{sessionId:'s'})
  expect(f.sidebar.storeFor('s').getSnapshot()).toMatchObject({sessionId:'s',quote:'原句',evidence:[evidence],checks})
 }finally{f.dispose()}
})
it('refreshes an existing tab without opening or activating a panel and rejects another session snapshot',()=>{
 const f=fixture();try{
  f.send('open',{sessionId:'s',threadId:'thread',evidence:[evidence]})
  const listener=vi.fn(),unsubscribe=f.sidebar.storeFor('s').subscribe(listener)
  f.send('state',{sessionId:'other',level:2,checks,coverage:{checked:9,total:9},issues:[]})
  f.send('state',{sessionId:'s',level:2,checks,coverage:{checked:2,total:5},issues:[{threadId:'thread',quote:'原句已核查',category:'contradiction',message:'与相关段落不符',evidence:[evidence]}]})
  expect(f.service.openTab).toHaveBeenCalledTimes(1);expect(f.service.setPanelState).toHaveBeenCalledTimes(1)
  expect(f.sidebar.storeFor('s').getSnapshot()).toMatchObject({coverage:{checked:2,total:5},quote:'原句已核查',checks})
  expect(listener).toHaveBeenCalledTimes(1);unsubscribe()
 }finally{f.dispose()}
})
it('clears evidence on identity reset and disposal and never retains data in tab metadata',()=>{
 const f=fixture();try{
  f.send('open',{sessionId:'s',evidence:[evidence]});const store=f.sidebar.storeFor('s')
  f.document.dispatchEvent(new f.window.CustomEvent('sherlock:notes-reset'))
  expect(store.getSnapshot()).toBeNull();expect(f.service.closeTab).toHaveBeenCalledWith('notes-challenge:s',{sessionId:'s'})
  f.send('state',{sessionId:'s',level:2,checks,coverage:{checked:1,total:1},issues:[]})
  expect(store.getSnapshot()).toBeNull()
  f.sidebar.dispose();f.send('open',{sessionId:'s',evidence:[evidence]})
  expect(f.service.openTab).toHaveBeenCalledTimes(1)
 }finally{f.dispose()}
})
it('reuses a cleared subscriber store when the same session is reopened after identity reset',()=>{
 const f=fixture();try{
  f.send('open',{sessionId:'s',evidence:[evidence]});const subscribed=f.sidebar.storeFor('s')
  f.document.dispatchEvent(new f.window.CustomEvent('sherlock:notes-reset'))
  f.send('open',{sessionId:'s',evidence:[{...evidence,quote:'新账户的新依据'}]})
  expect(subscribed.getSnapshot()?.evidence[0].quote).toBe('新账户的新依据')
 }finally{f.dispose()}
})
it('drops a natively closed tab and cannot refresh its removed evidence',()=>{
 const f=fixture();try{
  f.send('open',{sessionId:'s',threadId:'thread',evidence:[evidence]})
  const store=f.sidebar.storeFor('s'),descriptor=f.service.registerTab.mock.calls[0][0]
  descriptor.onClose({id:'notes-challenge:s'},{sessionId:'s'})
  expect(store.getSnapshot()).toBeNull()
  f.send('state',{sessionId:'s',level:2,checks,coverage:{checked:1,total:1},issues:[{threadId:'thread',quote:'old',category:'logic',message:'old',evidence:[evidence]}]})
  expect(store.getSnapshot()).toBeNull();expect(f.service.openTab).toHaveBeenCalledTimes(1)
 }finally{f.dispose()}
})
it('routes source and location actions only from the current live snapshot',async()=>{
 const f=fixture();try{
  const locate=vi.fn(),recheck=vi.fn(),openSource=vi.fn(async()=>{})
  f.window.dshDesktop={conversationBrowser:{openSource}}
  f.document.addEventListener('sherlock:notes-challenge-locate',event=>locate(event.detail))
  f.document.addEventListener('sherlock:notes-challenge-recheck',event=>recheck(event.detail))
  f.send('open',{sessionId:'s',evidence:[evidence]})
  f.sidebar.locate('original',evidence.quote,'s');f.sidebar.locate('forged','forged','s');f.sidebar.recheck('s')
  expect(locate).toHaveBeenCalledExactlyOnceWith({sessionId:'s',blockId:'original',quote:evidence.quote})
  expect(recheck).toHaveBeenCalledExactlyOnceWith({sessionId:'s'})
  expect(await f.sidebar.openSource('https://example.com/report','s')).toBe(true)
  expect(openSource).toHaveBeenCalledExactlyOnceWith({sessionId:'s',url:'https://example.com/report'})
  expect(await f.sidebar.openSource('javascript:alert(1)','s')).toBe(false)
  f.switchSession('other');f.sidebar.locate('original',evidence.quote,'s');f.sidebar.recheck('s')
  expect(await f.sidebar.openSource('https://example.com/old','s')).toBe(false)
  expect(locate).toHaveBeenCalledTimes(1);expect(recheck).toHaveBeenCalledTimes(1);expect(openSource).toHaveBeenCalledTimes(1)
 }finally{f.dispose()}
})
it('bounds typed event payloads and clones data while rejecting empty and unsupported evidence',()=>{
 expect(normalizeNotesChallengeEvent({sessionId:'s',evidence:[{kind:'note',label:'label only'}]},'open')).toBeNull()
 for(const value of [{sessionId:'s'.repeat(257),evidence:[evidence]},{sessionId:'s',evidence:Array(33).fill(evidence)},{sessionId:'s',evidence:[{...evidence,quote:'x'.repeat(12001)}]},{sessionId:'s',evidence:[{...evidence,kind:'web'}]},{sessionId:'s',evidence:[{kind:'consensus',label:'x',data:{value:Infinity}}]}])expect(normalizeNotesChallengeEvent(value,'open')).toBeNull()
 const input={sessionId:'s',evidence:[{kind:'consensus',label:'实际查询结果',data:{median:12,count:5,source:'infodb',nested:{x:[1,2]}}}]}
 const output=normalizeNotesChallengeEvent(input,'open');input.evidence[0].data.nested.x.push(3)
 expect(output.evidence[0].data.nested.x).toEqual([1,2])
 expect(normalizeNotesChallengeEvent({sessionId:'s',level:5,checks,coverage:{checked:2,total:1},issues:[]},'state')).toBeNull()
})
it('renders text and data through React escaping with coverage and incomplete checks',()=>{
 const script='<img src=x onerror=alert(1)>'
 const store={subscribe:()=>()=>{},getSnapshot:()=>({sessionId:'s',quote:script,evidence:[{kind:'consensus',label:script,data:{source:'infodb',value:script}}],checks,coverage:{checked:2,total:5},issues:[]})}
 const html=renderToStaticMarkup(React.createElement(NotesChallengeTab,{scope:{sessionId:'s'},controller:{storeFor:()=>store},react:React}))
 expect(html).toContain('&lt;img');expect(html).not.toContain('<img');expect(html).toContain('2 / 5');expect(html).toContain('infodb 暂不可用')
})
it('installs the controller inside the real coordinator attach scope and upgrades definitions idempotently',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=patchNotesChallengeClient(source);expect(patchNotesChallengeClient(patched)).toBe(patched)
 const minimal='class ResearchSidebarCoordinator { attach(service,t,sessions){const unregisterGenerated=service.registerTab({});return()=>{unregisterGenerated?.();};}}'
 const registrations=[],window=new Window(),service={registerTab:value=>{registrations.push(value);return()=>{}},closeTab:()=>{}}
 const Coordinator=runInNewContext(patchNotesChallengeClient(minimal)+';ResearchSidebarCoordinator',{document:window.document,window,react:React,react_jsx_runtime:{jsx:React.createElement}})
 const dispose=new Coordinator().attach(service,()=>'',{list:{getSnapshot:()=>({current:'s',byId:{s:{}}})}})
 expect(registrations.map(x=>x.id)).toContain('sherlock-notes-challenge');dispose();await window.happyDOM.abort()
 const old=patched.replace('/* ework:notes-challenge-client:v1 */','/* ework:notes-challenge-client:v0 */')
 expect(patchNotesChallengeClient(old)).toBe(patched)
 expect(()=>patchNotesChallengeClient('class ResearchSidebarCoordinator {}')).toThrow('anchor')
})

it('wires the evidence controller through the complete notes-client patch',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=patchNotesClient(source)
 expect(patched.includes('/* EWORK_NOTES_CHALLENGE_CLIENT_BEGIN */')).toBe(true)
 expect(patchNotesClient(patched)).toBe(patched)
})
