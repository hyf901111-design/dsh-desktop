import {expect,it} from 'vitest'
import {restoreChallengeReviewState,saveChallengeReviewState} from '../src/preload/notes/challenge-review-state'

const blocks=[{id:'a',type:'paragraph',text:'完整核验的正文。'},{id:'b',type:'heading',text:'待核实的标题'}]
const checks=[{kind:'review',status:'completed' as const,detail:'已检查。'}]
async function snapshot(){return saveChallengeReviewState('标题',blocks,2,new Map(blocks.map((block,index)=>[block.id,{text:block.text,title:'标题',level:2,complete:index===0,issueCount:index}])),checks)}

it('persists only hashes, then restores issue and clean paragraph coverage with its checks',async()=>{
 const saved=await snapshot(),restored=await restoreChallengeReviewState(saved,'标题',blocks,2)
 expect(JSON.stringify(saved)).not.toContain(blocks[0]!.text);expect(saved.entries.every(entry=>/^[a-f\d]{64}$/.test(entry.hash))).toBe(true)
 expect([...restored.covered]).toEqual(blocks.map((block,index)=>[block.id,{text:block.text,title:'标题',level:2,complete:index===0,issueCount:index}]))
 expect(restored.checks).toEqual(checks)
})

it.each(['title','level','text','type'] as const)('validates restored %s against the current note',async change=>{
 const saved=await snapshot(),current=blocks.map(block=>({...block}))
 if(change==='text')current[0]!.text='较新的正文。'
 if(change==='type')current[0]!.type='heading'
 const restored=await restoreChallengeReviewState(saved,change==='title'?'新标题':'标题',current,change==='level'?3:2)
 expect([...restored.covered.keys()]).toEqual(change==='title'||change==='level'?[]:['b']);expect(restored.checks).toEqual([])
})

it('rejects malformed records without preventing valid paragraphs from restoring',async()=>{
 const saved=await snapshot();(saved.entries[0] as any).issueCount=-1
 const restored=await restoreChallengeReviewState(saved,'标题',blocks,2)
 expect([...restored.covered.keys()]).toEqual(['b'])
})
