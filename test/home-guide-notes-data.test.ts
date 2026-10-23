import {describe,expect,it} from 'vitest'
import {HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_TITLE,createHomeNotesGuideBridge,homeNotesGuideChallengeResult} from '../src/preload/home-guide-notes-data'
import {challengeDocumentBlocks} from '../src/preload/notes/challenge-scheduler'
import {challengeReplacementScope,challengeReplacementBody} from '../src/shared/notes-challenge'

const sessionId='home-guide-notes-contract'
const review=()=>({sessionId,requestId:'review-1',action:'review' as const,level:3 as const,title:HOME_NOTES_GUIDE_TITLE,blocks:challengeDocumentBlocks(HOME_NOTES_GUIDE_BLOCKS)})
describe('homepage note example data and isolated bridge',()=>{
 it('provides a substantial research note with explicit example data and exactly three anchored issue types',()=>{
  const request=review(),text=request.blocks.map(block=>block.text).join(''),result=homeNotesGuideChallengeResult(request)
  expect(text.length).toBeGreaterThanOrEqual(650);expect(text.length).toBeLessThan(1050);expect(text).toContain('演示数据')
  expect(new Set(result.issues.map(issue=>issue.category))).toEqual(new Set(['typo','contradiction','logic']))
  for(const issue of result.issues)expect(request.blocks.find(block=>block.id===issue.blockId)?.text).toContain(issue.quote)
  expect(result.completeBlockIds).toEqual(request.blocks.map(block=>block.id))
 })
 it('does not invent anchors when a paragraph was edited or omitted',()=>{
  const request=review();request.blocks=request.blocks.filter(block=>block.id!=='guide-note-logic').map(block=>block.id==='guide-note-growth'?{...block,text:'已修订的收入增速。'}:block)
  const result=homeNotesGuideChallengeResult(request)
  expect(result.issues.map(issue=>issue.category)).toEqual(['typo'])
  expect(result.coveredBlockIds).toEqual(request.blocks.map(block=>block.id))
 })
 it('optimizes the entire anchored sentence through the native replacement contract',()=>{
  const request=review(),result=homeNotesGuideChallengeResult(request),issue=result.issues.find(issue=>issue.category==='contradiction')!
  const optimized=homeNotesGuideChallengeResult({...request,action:'optimize',thread:{...issue,messages:[]}})
  const block=request.blocks.find(block=>block.id===issue.blockId)!,scope=challengeReplacementScope(block.text,issue.quote)
  expect('error' in scope).toBe(false);expect(optimized.reply?.replacement).toContain('10%');expect(optimized.reply?.replacement).not.toContain('20%')
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
 it('cancels pending review on disposal without returning late results',async()=>{
  const abort=new AbortController(),bridge=createHomeNotesGuideBridge(sessionId,abort.signal),pending=bridge.request('challenge',review())
  bridge.dispose();await expect(pending).rejects.toThrow()
 })
})
