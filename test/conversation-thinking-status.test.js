import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {patchConversationThinkingStatus} from '../scripts/lib/conversation-thinking-status.mjs'
import {EWorkNoteConversationRow} from '../scripts/lib/notes-activity.mjs'

let source,client,win
const fake=()=>{let value;value=new Proxy(function(){},{get:()=>value,apply:()=>value,construct:()=>({})});return value}
beforeAll(async()=>{
 source=patchConversationThinkingStatus(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 win=new Window();let descriptor
 win.__ModuleLoader__={load(value){descriptor=value}}
 runInNewContext(source,{document:win.document,window:win,CSS:win.CSS,HTMLElement:win.HTMLElement,localStorage:win.localStorage})
 const require=createRequire(import.meta.url)
 client=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?require(id):fake())
})
afterAll(async()=>{await win?.happyDOM.abort()})
function translate(locale){
 const start=source.indexOf('const '+locale+' = {'),end=source.indexOf('\n\t\t};',start)
 const entries=Object.fromEntries([...source.slice(start,end).matchAll(/"(execution\.[^"]+)": ("(?:[^"\\]|\\.)*")/g)].map(m=>[m[1],JSON.parse(m[2])]))
 return(key,values={})=>String(entries[key]??key).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''))
}
it.each([['zh','正在思考'],['en','Thinking']])('shows one default thinking state in %s before real activity', (locale,label)=>{
 const t=translate(locale)
 for(const node of [undefined,{kind:'context'},{kind:'assistant-step'}])expect(client.executionActivityLabel(node,t)).toBe(label)
 expect(client.executionSummaryStatus([{kind:'context'}],true,t)).toBe(label)
 expect(patchConversationThinkingStatus(source)).toBe(source)
})
it('retains specific labels for actual commands and searches',()=>{
 const t=translate('zh')
 expect(client.executionActivityLabel({kind:'command'},t)).toBe('正在处理指令…')
 expect(client.executionActivityLabel({kind:'tool-call',data:{root:{name:'web_search',argsRaw:JSON.stringify({query:'荷花'})}}},t)).toBe('正在使用互联网搜索“荷花”…')
 expect(client.executionSummaryStatus([],false,t)).toBe('执行过程')
})
it('uses thinking for initial note preparation, retaining real writing and checking phases',()=>{
 globalThis.react=React
 try{
  for(const [phase,stage,label] of [['preparing',undefined,'正在思考'],['generating',undefined,'正在思考'],['generating','model','正在思考'],['generating','writing','正在撰写内容'],['generating','validating','正在检查生成内容']]){
   let status
   renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{t:key=>key,UserBubble:()=>null,Progress:({entry})=>{status=entry.noteTask.status;return null},Markdown:()=>null,row:{requestId:'label',phase,stage}}))
   expect(status).toBe(label)
  }
 }finally{delete globalThis.react}
})
