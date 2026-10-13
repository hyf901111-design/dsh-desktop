import {expect,it} from 'vitest'
import {createNotesActivityStore} from '../scripts/lib/notes-activity.mjs'

it('keeps actual requests per session through generation, adoption and account reset',()=>{
  const doc=new EventTarget(),store=createNotesActivityStore(doc),seen=[]
  const off=store.subscribe(()=>seen.push(store.snapshot('a')))
  const send=(sessionId,requestId,phase,extra={})=>doc.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId,requestId,phase,...extra}}))
  send('a','old','ready');expect(store.snapshot('a')).toEqual([])
  send('a','r','preparing',{prompt:'撰写新内容'});const first=store.snapshot('a');expect(store.snapshot('b')).toEqual([])
  send('a','r','generating');expect(store.snapshot('a')[0].prompt).toBe('撰写新内容');expect(first[0].phase).toBe('preparing')
  send('b','s','preparing',{prompt:'另一个会话'});send('a','r','ready');send('a','r','accepted')
  expect(store.snapshot('a')[0]).toMatchObject({phase:'accepted',prompt:'撰写新内容'});expect(store.snapshot('b')[0].phase).toBe('preparing')
  doc.dispatchEvent(new Event('sherlock:notes-reset'));expect(store.snapshot('a')).toEqual([]);expect(store.snapshot('b')).toEqual([])
  off();store.dispose();const count=seen.length;send('a','t','preparing');expect(seen).toHaveLength(count)
})

it('merges replayed durable notes with current task state and native message order',async()=>{
 const {mergeNoteConversationFlow}=await import('../scripts/lib/notes-activity.mjs')
 const doc=new EventTarget(),store=createNotesActivityStore(doc)
 doc.dispatchEvent(new CustomEvent('sherlock:notes-history',{detail:{sessionId:'s',rows:[{requestId:'first',phase:'accepted',prompt:'以前的笔记任务',seq:3,startedAt:100,finishedAt:200,result:{kind:'text',markdown:'已采纳正文'}}]}}))
 doc.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'s',requestId:'new',phase:'preparing',prompt:'新请求'}}))
 doc.dispatchEvent(new CustomEvent('sherlock:notes-history',{detail:{sessionId:'s',rows:[{requestId:'new',phase:'preparing',seq:7,startedAt:300}]}}))
 expect(store.snapshot('s').find(r=>r.requestId==='new').prompt).toBe('新请求')
 const flow=mergeNoteConversationFlow([{kind:'node',key:'user'},{kind:'execution',nodeKeys:['assistant'],key:'answer'}],new Map([['user',{anchorSeq:1}],['assistant',{anchorSeq:6}]]),store.snapshot('s'))
 expect(flow.map(e=>e.key)).toEqual(['user','note:first','answer','note:new'])
 expect(flow.find(e=>e.key==='note:first').row.result.markdown).toBe('已采纳正文');store.dispose()
})
