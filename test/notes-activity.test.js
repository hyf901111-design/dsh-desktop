import {expect,it} from 'vitest'
import {createNotesActivityStore} from '../scripts/lib/notes-activity.mjs'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

it('keeps actual requests per session through generation, adoption and account reset',()=>{
  const doc=new EventTarget(),store=createNotesActivityStore(doc),seen=[]
  const off=store.subscribe(()=>seen.push(store.snapshot('a')))
  const send=(sessionId,requestId,phase,extra={})=>doc.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId,requestId,phase,...extra}}))
  send('a','old','ready');expect(store.snapshot('a')).toEqual([])
  send('a','r','preparing',{prompt:'撰写新内容'});const first=store.snapshot('a');expect(store.snapshot('b')).toEqual([])
  send('a','r','generating');expect(store.snapshot('a')[0].prompt).toBe('撰写新内容');expect(first[0].phase).toBe('preparing')
  send('b','s','preparing',{prompt:'另一个会话'});send('a','r','ready');const completedAt=store.snapshot('a')[0].finishedAt;send('a','r','accepted');expect(store.snapshot('a')[0].finishedAt).toBe(completedAt)
  expect(store.snapshot('a')[0]).toMatchObject({phase:'accepted',prompt:'撰写新内容'});expect(store.snapshot('b')[0].phase).toBe('preparing')
  doc.dispatchEvent(new Event('sherlock:notes-reset'));expect(store.snapshot('a')).toEqual([]);expect(store.snapshot('b')).toEqual([])
  off();store.dispose();const count=seen.length;send('a','t','preparing');expect(seen).toHaveLength(count)
})
it('routes live reasoning through the shared native process disclosure and keeps explicit result feedback',async()=>{
 const {EWorkNoteConversationRow}=await import('../scripts/lib/notes-activity.mjs');globalThis.react=React
 const progress=[],markdown=[]
 const props={t:key=>key,UserBubble:()=>null,Progress:({entry})=>{progress.push(entry);return React.createElement('div',{'data-running':entry.running},entry.noteTask.status)},Markdown:({blocks})=>{markdown.push(blocks);return React.createElement('div',null,blocks.map(b=>b.text).join(''))}}
 renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{...props,row:{requestId:'r',phase:'generating',stage:'thinking',reasoning:'process detail'}}))
 expect(progress[0]).toMatchObject({running:true,noteTask:{status:'正在思考',reasoning:'process detail'}});expect(markdown).toEqual([])
 const final=renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{...props,row:{requestId:'r',phase:'accepted',reasoning:'process detail',result:{kind:'text',markdown:'正文内容'}}}))
 expect(final).toContain('已将以下内容写入笔记。');expect(final).toContain('正文内容');expect(markdown.flat().some(block=>block.kind==='reasoning')).toBe(false)
 delete globalThis.react
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
