import {expect,it,vi} from 'vitest'
import {createNotesActivityStore} from '../scripts/lib/notes-activity.mjs'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFile} from 'node:fs/promises'
import {patchNotesActivity} from '../scripts/lib/notes-activity.mjs'
import {patchFigmaFinalConversation} from '../scripts/lib/patch-figma-final-shell.mjs'
import {capabilityReceiptText} from '../packages/dsh-research-task-runtime/client-capabilities.js'

it('keeps ordinary right-side replies unchanged while obsolete guide preview markers cannot create another card',async()=>{
 const {EWorkNoteConversationRow}=await import('../scripts/lib/notes-activity.mjs');globalThis.react=React
 const doc=new EventTarget();doc.documentElement={dataset:{homeGuidePointerRun:'run'}};const store=createNotesActivityStore(doc)
 const send=(phase,extra={})=>doc.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'s',requestId:'r',phase,...extra}}))
 const mark=(runId,active)=>doc.dispatchEvent(new CustomEvent('sherlock:home-guide-notes-summary-preview',{detail:{sessionId:'s',requestId:'r',runId,active}}))
 const props={sessionId:'s',t:key=>key,UserBubble:()=>null,Progress:()=>React.createElement('p',null,'真实执行状态'),Markdown:({blocks})=>React.createElement('p',null,blocks.map(b=>b.text).join('')),Actions:({extraActions})=>React.createElement('footer',null,extraActions),renderSlot:()=>React.createElement('button',{'aria-label':'添加到笔记'},'添加')}
 const render=()=>renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{...props,row:store.snapshot('s')[0]}))
 try{
  send('preparing',{prompt:'简短总结'});mark('foreign',true);expect(render()).not.toContain('data-note-result-preview')
  mark('run',true);expect(render()).not.toContain('data-note-summary-pending');expect(render()).not.toContain('添加到笔记')
  send('ready',{result:{kind:'text',markdown:'完整的短总结'}})
  const html=render();expect(html).not.toContain('data-note-result-preview');expect(html).toContain('完整的短总结');expect(html.match(/aria-label="添加到笔记"/g)).toHaveLength(1)
  mark('foreign',false);expect(render()).not.toContain('data-note-result-preview')
  mark('run',false);expect(render()).not.toContain('data-note-result-preview');expect(render()).toContain('完整的短总结')
 }finally{store.dispose();delete globalThis.react}
})

it('retains note reference chips when the production shell patch runs again during a rebuild',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const installed=patchNotesActivity(patchFigmaFinalConversation(source))
 expect(patchFigmaFinalConversation(installed)).toBe(installed)
 expect(patchNotesActivity(patchFigmaFinalConversation(installed))).toBe(installed)
 expect(installed).toContain('noteReferences?.map(reference=>react.createElement(EWorkNoteMessageReference')
})

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
it('shows only a short note stage for live and replayed reasoning while preserving actual results',async()=>{
 const {EWorkNoteConversationRow}=await import('../scripts/lib/notes-activity.mjs');globalThis.react=React
 const progress=[],markdown=[]
 const props={t:key=>key,UserBubble:()=>null,Progress:({entry})=>{progress.push(entry);return React.createElement('div',{'data-running':entry.running},entry.noteTask.status)},Markdown:({blocks})=>{markdown.push(blocks);return React.createElement('div',null,blocks.map(b=>b.text).join(''))}}
 renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{...props,row:{requestId:'r',phase:'generating',stage:'thinking',reasoning:'process detail'}}))
 expect(progress[0]).toMatchObject({running:true,noteTask:{status:'正在思考'}});expect(progress[0].noteTask).not.toHaveProperty('reasoning');expect(markdown).toEqual([])
 const final=renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{...props,row:{requestId:'r',phase:'accepted',reasoning:'process detail',result:{kind:'text',markdown:'正文内容'}}}))
 expect(final).toContain('已将以下内容写入笔记。');expect(final).toContain('正文内容');expect(progress.at(-1).noteTask).not.toHaveProperty('reasoning');expect(markdown.flat().some(block=>block.kind==='reasoning')).toBe(false);expect(final).not.toContain('process detail')
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

it('shows completed host actions while the model is still thinking, keeps their effects on stop, and avoids a second final receipt',async()=>{
 const {EWorkNoteConversationRow}=await import('../scripts/lib/notes-activity.mjs')
 vi.stubGlobal('react',React);vi.stubGlobal('eworkNoteCapabilityReceiptText',capabilityReceiptText)
 vi.stubGlobal('document',{documentElement:{dataset:{odysseyLocale:'en'}}})
 const doc=new EventTarget(),store=createNotesActivityStore(doc)
 const send=(phase,extra={})=>doc.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'a',requestId:'r',phase,...extra}}))
 const props={t:key=>key,UserBubble:()=>null,Progress:({entry})=>React.createElement('div',{'data-running':entry.running},entry.noteTask.status),Markdown:({blocks})=>React.createElement('div',null,blocks.map(b=>b.text).join('\n'))}
 const render=()=>renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{...props,row:store.snapshot('a')[0]}))
 const receipt={requestId:'style',capability:'notes.components.style',status:'succeeded',message:'已保存 1 个组件的样式。',effect:{state:'saved',changedBlockIds:['r']},data:{internal:'not-for-display'}}
 try{
  send('preparing',{prompt:'保存样式后导出'})
  send('generating',{capabilityProgress:[receipt]})
  send('generating',{stage:'thinking',reasoning:'actual model reasoning'})
  const running=render()
  expect(running).toContain('data-note-client-progress');expect(running).toContain('Component style: Completed')
  expect(running).toContain('Saved styles for 1 components.');expect(running).not.toContain('data-note-feedback=')
  expect(running).not.toMatch(/not-for-display|正在分析内容与修改要求|已用时/)
  send('stopped');expect(render()).toContain('Saved styles for 1 components.')
  send('replied',{result:{kind:'conversation',markdown:'untrusted model completion',capabilityReceipts:[receipt]}})
  const final=render()
  expect(final).not.toContain('data-note-client-progress');expect(final.split('Component style: Completed')).toHaveLength(2)
  expect(final).not.toContain('untrusted model completion')
  doc.dispatchEvent(new Event('sherlock:notes-reset'));expect(store.snapshot('a')).toEqual([])
  for(const result of [{kind:'text',markdown:'新文章预览'},{kind:'component',node:{title:'预览组件'}}]){
   // Durable replay contains no transient capabilityProgress field.
   doc.dispatchEvent(new Event('sherlock:notes-reset'))
   doc.dispatchEvent(new CustomEvent('sherlock:notes-history',{detail:{sessionId:'a',rows:[{requestId:'r',phase:'ready',startedAt:1,finishedAt:2,result:{...result,capabilityReceipts:[receipt]}}]}}))
   const restored=render()
   expect(restored).toContain('data-note-client-receipts');expect(restored).not.toContain('data-note-client-progress')
   expect(restored.split('Component style: Completed')).toHaveLength(2)
   expect(restored).toContain(result.kind==='text'?'新文章预览':'预览组件')
  }
 }finally{store.dispose();vi.unstubAllGlobals()}
})


it('drops internal reasoning only from the Notes presentation store without changing event or persisted payloads',()=>{
 const doc=new EventTarget(),store=createNotesActivityStore(doc)
 const detail={sessionId:'s',requestId:'live',phase:'preparing',prompt:'创建表格',reasoning:'Let me analyze private wireToken instructions',stage:'thinking',outputChars:42}
 doc.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail}))
 expect(store.snapshot('s')[0]).not.toHaveProperty('reasoning')
 expect(store.snapshot('s')[0]).toMatchObject({prompt:'创建表格',stage:'thinking',outputChars:42})
 expect(detail.reasoning).toBe('Let me analyze private wireToken instructions')
 const row={requestId:'old',phase:'failed',error:'TIMEOUT',reasoning:'old private protocol',startedAt:1,finishedAt:2}
 doc.dispatchEvent(new CustomEvent('sherlock:notes-history',{detail:{sessionId:'s',rows:[row]}}))
 expect(store.snapshot('s').find(value=>value.requestId==='old')).toMatchObject({phase:'failed',error:'TIMEOUT'})
 expect(store.snapshot('s').find(value=>value.requestId==='old')).not.toHaveProperty('reasoning')
 expect(row.reasoning).toBe('old private protocol');store.dispose()
})

it('migrates the old Notes reasoning disclosure without changing canvas and native detail bodies',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const installed=patchNotesActivity(patchFigmaFinalConversation(source))
 expect(installed.includes('/* ework:notes-concise-progress:v1 */')).toBe(true)
 expect(installed.includes('const expandable = entry.noteTask ? false : !!entry.canvasTask || detailGroups.length > 0;')).toBe(true)
 expect(installed.includes('text:entry.noteTask.reasoning')).toBe(false)
 expect(installed.includes('row.outputChars,row.reasoning?.length')).toBe(false)
 expect(installed.includes('open && entry.canvasTask && react.createElement')).toBe(true)
 expect(patchNotesActivity(installed)).toBe(installed)
 const original='const expandable = !!entry.canvasTask || detailGroups.length > 0;'
 const previous='/* ework:notes-shared-reasoning:v1 */ const expandable = !!entry.noteTask?.reasoning || !!entry.canvasTask || detailGroups.length > 0;'
 const details="open && entry.noteTask?.reasoning && react.createElement('div',{className:ChatView_module_css_default.executionDetails},react.createElement(AssistantMarkdown,{blocks:[{kind:'text',text:entry.noteTask.reasoning}],streaming:false,interrupted:false,t})), "
 const fresh=source.replace(previous,original).replace(details,'')
 expect(patchNotesActivity(patchFigmaFinalConversation(fresh))===installed).toBe(true)
})
