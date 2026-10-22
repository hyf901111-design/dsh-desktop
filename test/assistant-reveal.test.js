import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createAssistantRevealLedger,patchAssistantReveal} from '../scripts/lib/assistant-reveal.mjs'
import {createNotesActivityStore,patchNotesActivity} from '../scripts/lib/notes-activity.mjs'
const node=(key,seq,status='settled')=>({key,kind:'assistant-step',anchorSeq:seq,data:{status}})
it('baselines native history and older pages, while distinguishing new fast results and live fragments per session',()=>{
 const ledger=createAssistantRevealLedger(),owner=()=>{},other=()=>{},nodes=new Map([['old',node('old',10)]]);
 ledger.observe(owner,'loading',['old'],nodes);ledger.observe(owner,'open',['old'],nodes);expect(ledger.record(owner,nodes.get('old')).fresh).toBe(false)
 nodes.set('older',node('older',3));ledger.observe(owner,'open',['older','old'],nodes);expect(ledger.record(owner,nodes.get('older')).fresh).toBe(false)
 nodes.set('new',node('new',20));ledger.observe(owner,'open',['old','new'],nodes);expect(ledger.record(owner,nodes.get('new')).fresh).toBe(true)
 ledger.observe(other,'open',['old','new'],nodes);expect(ledger.record(other,nodes.get('new')).fresh).toBe(false)
 nodes.set('running',node('running',25,'running'));ledger.observe(owner,'open',['new','running'],nodes);const record=ledger.record(owner,nodes.get('running'));record.initialized=true;record.text='actual prefix'
 nodes.set('running',node('running',25));ledger.observe(owner,'open',['new','running'],nodes);expect(ledger.record(owner,nodes.get('running'))).toBe(record);expect(record).toMatchObject({text:'actual prefix',live:true});ledger.suspend(owner);ledger.observe(owner,'open',['new','running'],nodes);expect(record).toMatchObject({fresh:false,live:false,initialized:false})
})
it('grants Notes presentation only from a real new preparing chain, never from history, and preserves its record through adoption/reset',()=>{
 const doc=new EventTarget(),store=createNotesActivityStore(doc),send=(type,detail)=>doc.dispatchEvent(new CustomEvent(type,{detail}));
 send('sherlock:notes-history',{sessionId:'s',rows:[{requestId:'old',phase:'replied',result:{kind:'conversation',markdown:'History'}}]});expect(store.reveal('s','old')).toBeUndefined()
 send('sherlock:notes-task-state',{sessionId:'s',requestId:'new',phase:'ready'});expect(store.reveal('s','new')).toBeUndefined()
 send('sherlock:notes-task-state',{sessionId:'s',requestId:'new',phase:'preparing'});const record=store.reveal('s','new');record.initialized=true;record.text='Complete original'
 send('sherlock:notes-task-state',{sessionId:'s',requestId:'new',phase:'accepted'});expect(store.reveal('s','new')).toBe(record)
 send('sherlock:notes-history',{sessionId:'s',rows:[{requestId:'new',phase:'accepted',finishedAt:1}]});expect(store.reveal('s','new')).toBe(record);expect(store.reveal('other','new')).toBeUndefined()
 doc.dispatchEvent(new Event('sherlock:notes-reset'));expect(store.reveal('s','new')).toBeUndefined();store.dispose()
})
it('patches the real keyed assistant renderer and Notes terminal props idempotently without changing streaming grammar or tool results',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),notes=patchNotesActivity(source),next=patchAssistantReveal(notes)
 expect(patchAssistantReveal(next)).toBe(next);expect(patchNotesActivity(next)).toBe(next)
 expect(next).toContain('eworkAssistantRevealLedger.record(eworkRevealOwner,node)');expect(next).toContain('text: block.text,');expect(next).toContain('streaming: data.status === "running"')
 expect(next).not.toContain('return messageId === void 0 ? content :');expect(next).toContain('streaming:false,reveal,t');expect(next).toContain('eworkAssistantRevealLedger.observe(useSession,openState,order,nodeStore)')
})
