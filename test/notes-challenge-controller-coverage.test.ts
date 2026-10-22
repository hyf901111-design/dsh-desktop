// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest'
import {act,createElement} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import * as Y from 'yjs'
import {webcrypto} from 'node:crypto'
import {useNoteChallenge} from '../src/preload/notes/challenge-controller'
import type {ChallengeResult} from '../src/shared/notes-challenge'

// Replacement editing requires a full ProseMirror view; it is unrelated to the
// real controller/scheduler publication and persistence exercised here.
vi.mock('../src/preload/notes/replacement-review',()=>({useNoteReplacementReviews:()=>({})}))
vi.mock('../src/preload/notes/editor-visibility',()=>({noteEditorVisible:()=>true}))
const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})

async function mount(answers:ChallengeResult[],saved?:unknown){
 vi.useFakeTimers();vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.spyOn(document,'hasFocus').mockReturnValue(true)
 const doc=new Y.Doc();doc.getMap('note-challenge').set('level',4);if(saved)doc.getMap('note-challenge-results').set('state',saved)
 const host=document.createElement('div');document.body.append(host);const root:Root=createRoot(host),published:any[]=[],requests:any[]=[]
 const listener=(event:Event)=>published.push((event as CustomEvent).detail);document.addEventListener('sherlock:notes-challenge-state',listener)
 const comments={store:{state:{selectedThreadId:undefined},subscribe:()=>()=>{}},selectThread:vi.fn(),threadStore:{}}
 const editor={document:[{id:'p',type:'paragraph',content:[{type:'text',text:'结论仍需要补充深入校验。',styles:{}}]}],getExtension:()=>comments,onChange:()=>()=>{},onSelectionChange:()=>()=>{},_tiptapEditor:{view:{hasFocus:()=>false,composing:false}}}
 const persist=vi.fn(),persistConfirmed=vi.fn(async()=>{}),bridge={request:vi.fn(async(type:string,input:any)=>{if(type!=='challenge')return;requests.push(input);return answers[Math.min(requests.length-1,answers.length-1)]})}
 let latest:ReturnType<typeof useNoteChallenge>|undefined
 const Harness=()=>{latest=useNoteChallenge({editor,doc,bridge:bridge as any,sessionId:'s',title:'研究笔记',scroll:{current:host},busy:false,recovery:false,active:true,persist,persistConfirmed});return null}
 await act(async()=>root.render(createElement(Harness)))
 cleanups.push(async()=>{await act(async()=>root.unmount());document.removeEventListener('sherlock:notes-challenge-state',listener);host.remove();doc.destroy()})
 const tick=async(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms)})
 return{doc,published,requests,tick,persistConfirmed,current:()=>latest}
}
const partial:ChallengeResult={version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:[],checks:[{kind:'review',status:'partial',detail:'基础检查完成，深入检查尚未完成。'}]}
const complete:ChallengeResult={...partial,completeBlockIds:['p'],checks:[{kind:'review',status:'completed',detail:'当前等级全部检查完成。'}]}

it('publishes no completed paragraphs for an actual partial controller result, then counts a completed supplement',async()=>{
 const f=await mount([partial,complete]);await f.tick(2000)
 expect(f.requests).toHaveLength(1);expect(f.published.at(-1).checks).toEqual(partial.checks);expect(f.published.at(-1).coverage).toEqual({checked:0,total:1})
 await f.tick(6001);expect(f.requests).toHaveLength(2);expect(f.published.at(-1).coverage).toEqual({checked:1,total:1})
 await f.tick(120000);expect(f.requests).toHaveLength(2)
})

it('persists a private retry allowance without duplicating the body and preserves exhausted partial coverage on remount',async()=>{
 const f=await mount([partial]);await f.tick(20002);expect(f.requests).toHaveLength(3)
 // Hashing uses WebCrypto rather than fake timers; allow the real persistence
 // queue to settle before taking the snapshot used by the second mount.
 await vi.waitFor(()=>expect((f.doc.getMap<any>('note-challenge-results').get('state') as any)?.retrySchedule?.entries[0]?.attempts).toBe(2),{interval:1})
 const saved=f.doc.getMap<any>('note-challenge-results').get('state');expect(saved.entries[0].complete).toBe(false);expect(JSON.stringify(saved)).not.toContain('结论仍需要补充深入校验。')
 expect(f.published.at(-1).coverage).toEqual({checked:0,total:1});expect(f.persistConfirmed).toHaveBeenCalled()
 const reopened=await mount([complete],saved);await vi.waitFor(()=>expect(reopened.current()?.phase).toBe('waiting'),{interval:1});await reopened.tick(1200000)
 expect(reopened.requests).toEqual([]);expect(reopened.published.at(-1).coverage).toEqual({checked:0,total:1})
})
