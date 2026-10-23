// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest'
import {act,createElement} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import * as Y from 'yjs'
import {webcrypto} from 'node:crypto'
import {useNoteChallenge} from '../src/preload/notes/challenge-controller'
import type {ChallengeLevel,ChallengeResult} from '../src/shared/notes-challenge'

// Replacement editing requires a full ProseMirror view; it is unrelated to the
// real controller/scheduler publication and persistence exercised here.
vi.mock('../src/preload/notes/replacement-review',()=>({useNoteReplacementReviews:()=>({})}))
vi.mock('../src/preload/notes/editor-visibility',()=>({noteEditorVisible:()=>true}))
const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})

async function mount(answers:ChallengeResult[],saved?:unknown,options:{text?:string;title?:string;level?:ChallengeLevel;usage?:unknown}={}){
 vi.useFakeTimers();vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.spyOn(document,'hasFocus').mockReturnValue(true)
 const doc=new Y.Doc();doc.getMap('note-challenge').set('level',options.level??4);if(saved)doc.getMap('note-challenge-results').set('state',saved);if(options.usage)doc.getMap('note-challenge-results').set('usage',options.usage)
 const host=document.createElement('div');document.body.append(host);const root:Root=createRoot(host),published:any[]=[],requests:any[]=[]
 const listener=(event:Event)=>published.push((event as CustomEvent).detail);document.addEventListener('sherlock:notes-challenge-state',listener)
 const comments={store:{state:{selectedThreadId:undefined},subscribe:()=>()=>{}},selectThread:vi.fn(),threadStore:{}}
 const changes=new Set<(...args:any[])=>void>(),editor={document:[{id:'p',type:'paragraph',content:[{type:'text',text:options.text??'结论仍需要补充深入校验。',styles:{}}]}],getExtension:()=>comments,onChange:(fn:(...args:any[])=>void)=>{changes.add(fn);return()=>{changes.delete(fn)}},onSelectionChange:()=>()=>{},_tiptapEditor:{view:{hasFocus:()=>false,composing:false}}}
 const persist=vi.fn(),persistConfirmed=vi.fn(async()=>{}),bridge={request:vi.fn(async(type:string,input:any)=>{if(type!=='challenge')return;requests.push(input);return answers[Math.min(requests.length-1,answers.length-1)]})}
 let latest:ReturnType<typeof useNoteChallenge>|undefined,title=options.title??'研究笔记',detached=false
 const Harness=()=>{latest=useNoteChallenge({editor,doc,bridge:bridge as any,sessionId:'s',title,scroll:{current:host},busy:false,recovery:false,active:true,persist,persistConfirmed});return null}
 await act(async()=>root.render(createElement(Harness)))
 const detach=async()=>{if(detached)return;detached=true;await act(async()=>root.unmount());document.removeEventListener('sherlock:notes-challenge-state',listener);host.remove();doc.destroy()};cleanups.push(detach)
 const tick=async(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms)})
 const edit=async(text:string)=>act(async()=>{editor.document[0]!.content[0]!.text=text;for(const changed of changes)changed(editor,{getChanges:()=>[]})})
 const rename=async(value:string)=>act(async()=>{title=value;root.render(createElement(Harness))})
 const setLevel=async(value:ChallengeLevel)=>act(async()=>{doc.getMap('note-challenge').set('level',value)})
 return{doc,published,requests,tick,persistConfirmed,current:()=>latest,detach,edit,rename,setLevel}
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
 const saved=f.doc.getMap<any>('note-challenge-results').get('state');expect(saved.entries[0].complete).toBe(false);expect(saved.retrySchedule).not.toHaveProperty('usage');expect(JSON.stringify(saved)).not.toContain('结论仍需要补充深入校验。')
 expect(f.published.at(-1).coverage).toEqual({checked:0,total:1});expect(f.persistConfirmed).toHaveBeenCalled()
 const reopened=await mount([complete],saved);await vi.waitFor(()=>expect(reopened.current()?.phase).toBe('waiting'),{interval:1});await reopened.tick(1200000)
 expect(reopened.requests).toEqual([]);expect(reopened.published.at(-1).coverage).toEqual({checked:0,total:1})
})

it.each(['text','title','level','legacy'] as const)('retains the session token limit when %s changes immediately before detach',async change=>{
 const f=await mount([{...complete,usage:{inputTokens:40000,outputTokens:1}}]);await f.tick(2000)
 await vi.waitFor(()=>expect(f.doc.getMap<any>('note-challenge-results').get('state')?.entries[0]?.complete).toBe(true),{interval:1})
 const original=f.doc.getMap<any>('note-challenge-results').get('state'),before=JSON.stringify(original),usage=f.doc.getMap<any>('note-challenge-results').get('usage')
 expect(usage).toMatchObject({version:1,sessionId:'s',usage:[{input:40000}]});expect(f.requests).toHaveLength(1)
 const text=change==='text'||change==='legacy'?'结论已修改一个字，仍需要深入校验。':'结论仍需要补充深入校验。',title=change==='title'?'修改后的研究标题':'研究笔记',level=change==='level'?3:4
 if(change==='text'||change==='legacy')await f.edit(text)
 if(change==='title')await f.rename(title)
 if(change==='level')await f.setLevel(level)
 // No new review ran or coverage flush happened after the semantic/tier edit.
 expect(f.requests).toHaveLength(1);expect(JSON.stringify(f.doc.getMap('note-challenge-results').get('state'))).toBe(before)
 const saved=JSON.parse(before);if(change==='legacy')saved.retrySchedule.usage=usage.usage
 await f.detach()
 const reopened=await mount([complete],saved,{text,title,level,usage:change==='legacy'?undefined:usage})
 await vi.waitFor(()=>expect(reopened.current()?.phase).toBe('limited'),{interval:1})
 const remaining=usage.usage[0].at+600000-Date.now();expect(remaining).toBeGreaterThan(0)
 await reopened.tick(remaining-1);expect(reopened.requests).toEqual([])
 await reopened.tick(2);expect(reopened.requests).toHaveLength(1)
})
