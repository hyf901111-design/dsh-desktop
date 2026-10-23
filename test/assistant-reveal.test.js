import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'
import {patchCanvasUseClient} from '../scripts/lib/canvas-use-client.mjs'
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
 expect(next).toContain('eworkAssistantRevealLedger.record(eworkRevealOwner,node)');expect(next).toContain('/* ework:assistant-reveal-follow:v1 */');expect(next.match(/el.scrollTop = assistantRevealScrollTop\(el\) \?\? el.scrollHeight;/g)).toHaveLength(2);expect(next).toContain('if(movedByReader)finishAssistantReveals(local);');expect(next).toContain('text: block.text,');expect(next).toContain('streaming: data.status === "running"')
 expect(next).not.toContain('return messageId === void 0 ? content :');expect(next).toContain('streaming:false,reveal,t');expect(next).toContain('eworkAssistantRevealLedger.observe(useSession,openState,order,nodeStore)')
})
it('refreshes an already patched runtime helper without duplicating its native wiring',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),next=patchAssistantReveal(source),stale=next.replace('focused=doc.hasFocus?.()!==false','focused=false/* previous packaged helper */')
 expect(stale).not.toBe(next);expect(patchAssistantReveal(stale)).toBe(next);expect(patchAssistantReveal(next)).toBe(next)
})
it('upgrades an already installed v1 reply seat to live progress and synchronous view revocation',()=>{
 const next=patchAssistantReveal(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const old=next.replace('openFile, t, reveal, revealRoute })','openFile, t, reveal })').replace('useAssistantTextPaint(react,interrupted?undefined:reveal,blocks,revealRoute);','useAssistantTextPaint(react,interrupted?undefined:reveal,blocks);').replace('revealRoute:"node",','').replace('/* ework:assistant-reveal-seats:v1 */ blocks: update.blocks,\nreveal:eworkAssistantRevealLedger.record(seatProps.useSession,activityNodes.find(node=>node.key===update.key)),revealRoute:"progress",','blocks: update.blocks,').replace('react.useLayoutEffect(()=>()=>eworkAssistantRevealLedger.suspend(useSession),','react.useEffect(()=>()=>eworkAssistantRevealLedger.suspend(useSession),').replace('settleConversationScrollBottom(el,callback=>requestAnimationFrame(()=>{if(atBottomRef.current)callback()}), () => {','settleConversationScrollBottom(el, requestAnimationFrame, () => {')
 expect(old).not.toBe(next);expect(patchAssistantReveal(old)).toBe(next)
})
it('revokes a pending host transfer synchronously when its foreground view epoch ends',()=>{
 const ledger=createAssistantRevealLedger(),owner=()=>{},nodes=new Map();ledger.observe(owner,'open',[],nodes);nodes.set('new',node('new',20,'running'));ledger.observe(owner,'open',['new'],nodes)
 const record=ledger.record(owner,nodes.get('new')),epoch=record.epoch;record.handoff={route:'progress',epoch,units:[{from:0,to:1,at:0}]};ledger.suspend(owner)
 expect(record.epoch).toBeGreaterThan(epoch);expect(record.handoff).toBeUndefined();expect(record.skipNext).toBe(true)
})

it('re-enters the early canvas patch after reply reveal without losing either scroll guard',()=>{
 const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),revealed=patchAssistantReveal(patchCanvasUseClient(raw))
 const replayed=patchCanvasUseClient(revealed)
 expect(replayed).toBe(revealed);expect(patchAssistantReveal(replayed)).toBe(replayed);expect(()=>new Script(replayed)).not.toThrow()
 expect(replayed).toContain('if(el.dataset?.conversationReading)return;');expect(replayed).toContain('el.scrollTop = assistantRevealScrollTop(el) ?? el.scrollHeight;');expect(replayed).toContain('settleConversationScrollBottom(el,callback=>requestAnimationFrame(()=>{if(atBottomRef.current)callback()}), () => {')
 expect(replayed.match(/const stopAnchoring=anchorConversationDisclosures\(local,/g)).toHaveLength(1)
})
