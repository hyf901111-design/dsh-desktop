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
