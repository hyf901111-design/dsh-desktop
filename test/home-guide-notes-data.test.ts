import {describe,expect,it,vi} from 'vitest'
import {HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_TITLE,createHomeNotesGuideBridge,homeNotesGuideChallengeResult} from '../src/preload/home-guide-notes-data'
import {challengeDocumentBlocks} from '../src/preload/notes/challenge-scheduler'
import {challengeReplacementScope,challengeReplacementBody} from '../src/shared/notes-challenge'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as Y from 'yjs'
import {NotesStore} from '../src/main/notes/store'
import * as guideData from '../src/preload/home-guide-notes-data'
import * as guideContract from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'

const sessionId='home-guide-notes-contract'
const review=()=>({sessionId,requestId:'review-1',action:'review' as const,level:3 as const,title:HOME_NOTES_GUIDE_TITLE,blocks:challengeDocumentBlocks(HOME_NOTES_GUIDE_BLOCKS)})
describe('homepage note example data and isolated bridge',()=>{
 it('keeps actual daily prices separate from the three primary financial reports and quarter arithmetic',()=>{
  const facts=guideContract.HOME_NOTES_RESEARCH_FACTS,sources=guideContract.HOME_NOTES_REPORT_SOURCES
  expect(facts.period).toHaveLength(243);expect(Object.values(facts.values).map(values=>values[0])).toEqual([100,100])
  const quarter=4177786179503n-1949639808395n
  expect(quarter.toString()).toBe('2228146371108');expect((Number(quarter)/1949639808395-1)*100).toBeCloseTo(14.285026,5)
  expect(sources).toHaveLength(3);expect(sources.every(source=>/^https:\/\//.test(source.url)&&/\.PDF$/i.test(source.url))).toBe(true)
  expect(sources.map(source=>source.section).join(' ')).toContain('第26页')
 })
 it('delegates actual slash/library/render requests only after native demo admission through the original bridge',async()=>{
  const signal=new AbortController(),original={request:vi.fn(async method=>method==='load'?{saved:{title:'',blocks:[],yjs:'',revision:0,updatedAt:0}}:{ok:true}),draft:vi.fn()},native={generate:vi.fn(),stop:vi.fn()}
  const bridge=createHomeNotesGuideBridge(sessionId,signal.signal,undefined,{bridge:original as any,fresh:true},undefined,native as any)
  await expect(bridge.request('library-list',{sessionId})).rejects.toThrow('先读取')
  await bridge.request('load',{sessionId})
  for(const method of ['menu-sync','menu-close','library-list','library-read','component-render','component-menu-capabilities'])expect(await bridge.request(method,{sessionId})).toEqual({ok:true})
  await expect(bridge.request('library-read',{sessionId:'other'})).rejects.toThrow('不匹配')
  await expect(bridge.request('export',{sessionId})).rejects.toThrow('不支持')
  const plain=createHomeNotesGuideBridge(sessionId,new AbortController().signal,undefined,{bridge:original as any,fresh:true});await plain.request('load',{sessionId})
  await expect(plain.request('library-read',{sessionId})).rejects.toThrow('不支持')
  signal.abort();await expect(bridge.request('library-list',{sessionId})).rejects.toMatchObject({name:'AbortError'})
 })
 it('shows the actual primary report sources and quarter formula for the small statistical correction',()=>{
  const request=review(),issue=homeNotesGuideChallengeResult(request).issues.find(item=>item.blockId==='guide-note-growth')!
  expect(issue.evidence).toHaveLength(3);expect(issue.quote).toBe('环比增长174.57%')
  const evidence=JSON.stringify(issue.evidence);expect(evidence).toContain('22281463711.08 / 19496398083.95');expect(evidence).toContain('14.29%')
  expect(evidence).toContain(guideContract.HOME_NOTES_REPORT_SOURCES[0]!.url)
 })
 it('provides five personal paragraphs and three review scopes',()=>{
  const request=review(),text=request.blocks.map(block=>block.text).join(''),result=homeNotesGuideChallengeResult(request)
  expect(text.length).toBeGreaterThan(450);expect(text.length).toBeLessThan(1000)
  expect(guideData.HOME_NOTES_GUIDE_WRITING_STAGES.map(items=>items.length)).toEqual([2,1,2])
  expect(HOME_NOTES_GUIDE_BLOCKS).toHaveLength(5);expect(result.issues).toHaveLength(3)
  expect(new Set(result.issues.map(issue=>issue.category))).toEqual(new Set(['contradiction','logic','grammar']))
  expect(text).toContain('增长兑现与估值');expect(text).toContain('沪深300')
  for(const issue of result.issues)expect(request.blocks.find(block=>block.id===issue.blockId)?.text).toContain(issue.quote)
  expect(result.completeBlockIds).toEqual(request.blocks.map(block=>block.id))
 })
 it('uses a two-series real daily price chart with the original A-share symbol',()=>{
  const spec=guideContract.HOME_NOTES_CHART_SPEC
  expect(spec).toMatchObject({variant:'line',unit:'起点=100',axisDecimals:2});expect(spec.labels).toHaveLength(243)
  expect(spec.series.map(series=>series.values[0])).toEqual([100,100]);expect(spec.series.map(series=>series.values.at(-1))).toEqual([139.65114,89.123469])
  expect(spec.note).toContain('非含息');expect(guideContract.HOME_NOTES_GUIDE_STOCK).toEqual({code:'300308',market:'SZ',name:'中际旭创'})
 })
 it('does not invent anchors when a paragraph was edited or omitted',()=>{
  const request=review();request.blocks=request.blocks.filter(block=>block.id!=='guide-note-logic').map(block=>block.id==='guide-note-growth'?{...block,text:'已修订的收入增速。'}:block)
  const result=homeNotesGuideChallengeResult(request)
  expect(result.issues.map(issue=>issue.category)).toEqual(['logic','grammar'])
  expect(result.coveredBlockIds).toEqual(request.blocks.map(block=>block.id))
 })
 it('optimizes the entire anchored sentence through the native replacement contract',()=>{
  const request=review(),result=homeNotesGuideChallengeResult(request),issue=result.issues.find(issue=>issue.category==='contradiction')!
  const optimized=homeNotesGuideChallengeResult({...request,action:'optimize',thread:{...issue,messages:[]}})
  const block=request.blocks.find(block=>block.id===issue.blockId)!,scope=challengeReplacementScope(block.text,issue.quote)
  expect('error' in scope).toBe(false);expect(optimized.reply?.replacement).toContain('环比增长14.29%');expect(optimized.reply?.replacement).not.toContain('环比增长174.57%')
  expect(challengeReplacementBody('error' in scope?'':scope.quote,optimized.reply!.replacement!)).not.toHaveProperty('error')
 })
 it('keeps revisions and drafts only in an isolated memory document',async()=>{
  const abort=new AbortController(),bridge=createHomeNotesGuideBridge(sessionId,abort.signal)
  const initial=await bridge.request('load',{sessionId});expect(initial.saved.blocks).toEqual([])
  const content={title:HOME_NOTES_GUIDE_TITLE,blocks:HOME_NOTES_GUIDE_BLOCKS,yjs:''}
  await bridge.draft({sessionId,clientId:'guide',revision:0,content})
  const saved=await bridge.request('save',{sessionId,revision:0,clientId:'guide',content});expect(saved.status).toBe('saved');expect(saved.saved.revision).toBe(1)
  content.title='mutated caller';expect((await bridge.request('load',{sessionId})).saved.title).toBe(HOME_NOTES_GUIDE_TITLE)
  expect((await bridge.request('save',{sessionId,revision:0,content})).status).toBe('conflict')
  bridge.dispose()
 })
 it('fails closed for unknown methods, other sessions and aborted requests',async()=>{
  const abort=new AbortController(),bridge=createHomeNotesGuideBridge(sessionId,abort.signal)
  await expect(bridge.request('generate',{sessionId,prompt:'send live model'})).rejects.toThrow('演示')
  await expect(bridge.request('save',{sessionId:'real-user-note',revision:0,content:{title:'',blocks:[],yjs:''}})).rejects.toThrow('演示')
  abort.abort();await expect(bridge.request('load',{sessionId})).rejects.toThrow()
  await expect(bridge.draft({sessionId,clientId:'guide',revision:0,content:{title:'',blocks:[],yjs:''}})).rejects.toThrow()
 })
 it('routes native generation only through its admitted example driver and keeps late replies cancelled',async()=>{
  let resolve!:(value:any)=>void;const generated:any[]=[],stopped:string[]=[]
  const driver={generate:(input:any)=>{generated.push(input);return new Promise<any>(done=>resolve=done)},stop:async(id:string)=>{stopped.push(id)}}
  const bridge=createHomeNotesGuideBridge(sessionId,new AbortController().signal,undefined,undefined,undefined,driver)
  const input={sessionId,requestId:'native-generation',prompt:'请整理当前笔记。',context:{scope:'note'}}
  const pending=bridge.request('generate',input);await vi.waitFor(()=>expect(generated).toEqual([input]))
  await expect(bridge.request('generate',{...input,sessionId:'another-session'})).rejects.toThrow('会话')
  await bridge.request('stop',{sessionId,requestId:input.requestId});await expect(pending).rejects.toThrow('取消');expect(stopped).toEqual([input.requestId])
  resolve({kind:'text',markdown:'取消之后的建议。'});bridge.dispose()
 })
 it('forwards accepted native conversation state only to the same prepared persistence session',async()=>{
  const storage={request:vi.fn(async(method:string)=>method==='load'?{saved:{title:'',blocks:[],yjs:'',revision:0,updatedAt:0}}:{ok:true}),draft:async()=>{}}
  const driver={generate:async()=>({kind:'text' as const,markdown:'资料截点。'}),stop:async()=>{}}
  const bridge=createHomeNotesGuideBridge(sessionId,new AbortController().signal,undefined,{bridge:storage,fresh:true},undefined,driver)
  await expect(bridge.request('generate',{sessionId,requestId:'not-admitted',prompt:'资料截点'})).rejects.toThrow('读取')
  await bridge.request('load',{sessionId});await bridge.request('conversation-state',{sessionId,requestId:'accepted-native',phase:'accepted'})
  expect(storage.request).toHaveBeenLastCalledWith('conversation-state',{sessionId,requestId:'accepted-native',phase:'accepted'})
  await expect(bridge.request('conversation-state',{sessionId:'foreign',requestId:'accepted-native',phase:'accepted'})).rejects.toThrow('会话');bridge.dispose()
 })
 it('cancels pending review on disposal without returning late results',async()=>{
  const abort=new AbortController(),bridge=createHomeNotesGuideBridge(sessionId,abort.signal),pending=bridge.request('challenge',review())
  bridge.dispose();await expect(pending).rejects.toThrow()
 })
 it('keeps review and optimization busy for the private playback clock and cancels its pending wait',async()=>{
  const pauses:number[]=[],releases:Array<()=>void>=[]
  const wait=(ms:number)=>{pauses.push(ms);return new Promise<void>(resolve=>releases.push(resolve))}
  const bridge=createHomeNotesGuideBridge(sessionId,new AbortController().signal,undefined,undefined,wait)
  let settled=false
  const first=bridge.request('challenge',review()).then(value=>{settled=true;return value})
  await vi.waitFor(()=>expect(pauses).toEqual([2000]))
  expect(settled).toBe(false);releases.shift()!();expect((await first).issues).toHaveLength(3)
  const request=review(),issue=homeNotesGuideChallengeResult(request).issues[0]!
  const next=bridge.request('challenge',{...request,requestId:'optimize-clock',action:'optimize',thread:{...issue,messages:[]}})
  await vi.waitFor(()=>expect(pauses).toEqual([2000,1700]))
  const rejected=expect(next).rejects.toThrow()
  bridge.dispose();await rejected
  releases.shift()!();await Promise.resolve()
 })
 it('persists full document and challenge metadata through the real NotesStore and leaves it after disposal',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'home-guide-notes-')),store=new NotesStore(directory),calls:string[]=[],owner='test-owner'
  const persistence={request:async(method:string,input:any)=>{calls.push(method);if(method==='load')return store.load(owner,input.sessionId);if(method==='save')return store.save(owner,input.sessionId,input.revision,input.content,input.clientId);throw Error('unexpected live request: '+method)},draft:async(input:any)=>store.draft(owner,input.sessionId,input.clientId,input.revision,input.content)}
  try{
   const abort=new AbortController(),bridge=createHomeNotesGuideBridge(sessionId,abort.signal,undefined,{bridge:persistence,fresh:true})
   await bridge.request('load',{sessionId})
   const doc=new Y.Doc();doc.getMap('note-challenge').set('level',3);doc.getMap('threads').set('saved-thread',{issue:'income growth'})
   const content={title:HOME_NOTES_GUIDE_TITLE,blocks:HOME_NOTES_GUIDE_BLOCKS,yjs:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')};doc.destroy()
   await bridge.draft({sessionId,clientId:'guide',revision:0,content});expect((await bridge.request('save',{sessionId,clientId:'guide',revision:0,content})).status).toBe('saved')
   bridge.dispose();abort.abort()
   const restored=store.load(owner,sessionId);expect(restored.saved.title).toBe(HOME_NOTES_GUIDE_TITLE);expect(restored.draft).toBeUndefined()
   const restoredDoc=new Y.Doc();Y.applyUpdate(restoredDoc,Buffer.from(restored.saved.yjs,'base64'));expect(restoredDoc.getMap('note-challenge').get('level')).toBe(3);expect(restoredDoc.getMap('threads').has('saved-thread')).toBe(true);restoredDoc.destroy()
   expect(calls).toEqual(['load','save'])
   const revisit=createHomeNotesGuideBridge(sessionId,new AbortController().signal,undefined,{bridge:persistence,fresh:false});expect((await revisit.request('load',{sessionId})).saved.blocks.length).toBe(HOME_NOTES_GUIDE_BLOCKS.length);revisit.dispose()
  }finally{rmSync(directory,{recursive:true,force:true})}
 })
 it('rejects a fresh tutorial on an existing note instead of replacing it or forwarding model actions',async()=>{
  const calls:string[]=[],content={title:'用户笔记',blocks:[{id:'user',type:'paragraph',content:'保留'}],yjs:''}
  const persistence={request:async(method:string)=>{calls.push(method);return{saved:{...content,revision:2,updatedAt:1}}},draft:async()=>{throw Error('不应保存')}}
  const bridge=createHomeNotesGuideBridge(sessionId,new AbortController().signal,undefined,{bridge:persistence,fresh:true})
  await expect(bridge.request('load',{sessionId})).rejects.toThrow('已有')
  await expect(bridge.request('generate',{sessionId})).rejects.toThrow('演示')
  expect(calls).toEqual(['load']);bridge.dispose()
 })
})
