import {expect,it} from 'vitest'
import {challengeReviewAnchors} from '../packages/dsh-research-task-runtime/notes-challenge-review-context.js'

it('projects only unique current review anchor locations and never mutates the caller',()=>{
 const blocks=Object.freeze([{id:'p',text:'收入10%。收入说明。'},{id:'q',text:'Beta\nGamma'}])
 const anchors=Object.freeze([
  Object.freeze({blockId:'q',quote:'Beta\nGamma',message:'PRIVATE',draft:'PRIVATE'}),
  Object.freeze({blockId:'p',quote:'收入10%'}),{blockId:'p',quote:'收入10%'},
  {blockId:'p',quote:'收入'},{blockId:'q',quote:'Beta Gamma'},
  {blockId:'gone',quote:'收入10%'},null,{blockId:'q',quote:''}
 ])
 expect(challengeReviewAnchors(anchors,blocks)).toEqual([{blockId:'p',quote:'收入10%'},{blockId:'q',quote:'Beta\nGamma'}])
 expect(anchors[0].draft).toBe('PRIVATE')
})

it('reserves review anchor context slots round-robin across blocks and caps the result at 64',()=>{
 const first=Array.from({length:80},(_,n)=>({blockId:'p',quote:'P'+String(n).padStart(3,'0')})),last=[{blockId:'q',quote:'Qone'},{blockId:'q',quote:'Qtwo'}]
 const result=challengeReviewAnchors([...first,...last],[{id:'p',text:first.map(a=>a.quote).join(' ')},{id:'q',text:'Qone Qtwo'}])
 expect(result).toHaveLength(64)
 expect(result.slice(0,4)).toEqual([first[0],last[0],first[1],last[1]])
 expect(result.every(a=>Object.keys(a).join(',')==='blockId,quote')).toBe(true)
})

it('bounds the serialized review anchor context including JSON escaping and skips oversized quotes',()=>{
 const blocks=Array.from({length:6},(_,n)=>({id:String(n),text:String(n)+'文'.repeat(1499)})),anchors=blocks.map(b=>({blockId:b.id,quote:b.text}))
 const selected=challengeReviewAnchors(anchors,blocks)
 expect(selected).toHaveLength(5);expect(JSON.stringify(selected).length).toBeLessThanOrEqual(8000)
 const escaped=Array.from({length:3},(_,n)=>({id:String(n),text:'\n'.repeat(1999)+n})),references=escaped.map(b=>({blockId:b.id,quote:b.text}))
 expect(challengeReviewAnchors(references,escaped)).toHaveLength(1)
 expect(challengeReviewAnchors([{blockId:'p',quote:'A'.repeat(2001)},{blockId:'p',quote:'Q'}],[{id:'p',text:'A'.repeat(2001)+' Q'}])).toEqual([{blockId:'p',quote:'Q'}])
})
