import {afterEach,expect,it} from 'vitest'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFile} from 'node:fs/promises'
import {createSourceFile,ScriptTarget,ScriptKind,isMethodDeclaration,forEachChild} from 'typescript'
import {EWorkNoteConversationRow} from '../scripts/lib/notes-activity.mjs'
import {recordNoteConversation,noteConversationRows,registerNoteConversationContext} from '../packages/dsh-research-task-runtime/notes-session.js'
import {Session} from '@deepseek-ai/dsh-session'
import {noteFeedbackTarget,patchNoteFeedbackHost,patchNoteForkHost,noteForkBoundary} from '../scripts/lib/notes-reply-actions.mjs'

afterEach(()=>{delete globalThis.react})
it.each(['text','conversation'])('gives completed %s replies the native footer with the original reply and durable branch boundary',kind=>{
 globalThis.react=React
 const row={requestId:'r',phase:kind==='text'?'ready':'replied',completedSeq:7,finishedAt:1000,result:{kind,markdown:'# 正文\n完整回复'}}
 let actual,extras
 const html=renderToStaticMarkup(React.createElement(EWorkNoteConversationRow,{row,sessionId:'s',t:key=>key,UserBubble:()=>null,Progress:()=>null,Markdown:()=>null,Actions:props=>{actual=props;return React.createElement('div',{'data-native-actions':''})},renderSlot:(name,props)=>{extras={name,props};return null},forkAt:()=>{}}))
 expect(html).toContain('data-native-actions');expect(actual.text).toBe(row.result.markdown);expect(actual.branchUnavailable).toBeFalsy();expect(typeof actual.onBranch).toBe('function')
 expect(extras).toEqual({name:'conversation.chat.assistant-actions',props:{messageId:'ework-note:r',text:row.result.markdown}})
})
it('keeps inherited note answers in ordinary fork context while excluding actual subagents',()=>{
 const source=Session.create('parent');recordNoteConversation(source,{requestId:'r',phase:'ready',prompt:'问题',result:{kind:'text',markdown:'分支继续需要的完整回答'}})
 const fork=Session.fromRestore('fork',structuredClone(source.events),{...source.header,id:'fork',parentSession:'parent'})
 let context;registerNoteConversationContext({systemPrompt:{context:value=>{context=value}}})
 expect(context.text({agent:{session:fork}})).toContain('分支继续需要的完整回答')
 const subagent=Session.fromRestore('child',structuredClone(source.events),{...source.header,id:'child',parentSession:'parent',origin:'subagent'})
 expect(context.text({agent:{session:subagent}})).toBe('')
})
it('retains the exact completed reply event on replay instead of forking from preparing or later adoption',()=>{
 const session=Session.create('note-actions'),first=recordNoteConversation(session,{requestId:'r',phase:'preparing',prompt:'写作'})
 const final=recordNoteConversation(session,{requestId:'r',phase:'ready',result:{kind:'text',markdown:'正文'},finishedAt:1000})
 recordNoteConversation(session,{requestId:'r',phase:'accepted',finishedAt:2000})
 recordNoteConversation(session,{requestId:'later',phase:'preparing',prompt:'下一条'})
 expect(noteConversationRows(Session.fromRestore(session.id,structuredClone(session.events),session.header))[0]).toMatchObject({seq:first.seq,completedSeq:final.seq,phase:'accepted',finishedAt:1000})
})
it('admits durable completed note replies through the actual host feedback target predicate',async()=>{
 const source=patchNoteFeedbackHost(await readFile('node_modules/@deepseek-ai/dsh-message-feedback/lib/index.js','utf8')),syntax=createSourceFile('feedback.js',source,ScriptTarget.Latest,false,ScriptKind.JS)
 let method;const visit=node=>{if(isMethodDeclaration(node)&&node.name.getText(syntax)==='hasFeedbackTarget')method=node.getText(syntax);forEachChild(node,visit)};visit(syntax)
 const predicate=new Function('isAppendSurfaceEvent','deriveEventMessage','noteFeedbackTarget','return ({'+method+'}).hasFeedbackTarget')(()=>false,()=>null,noteFeedbackTarget)
 const row={requestId:'r',phase:'replied',result:{kind:'conversation',markdown:'真实回复'}}
 expect(predicate({events:[{type:'workspace-note/conversation',seq:4,data:row}]},'ework-note:r')).toBe(true)
 expect(predicate({events:[{type:'workspace-note/conversation',seq:4,data:{...row,phase:'preparing'}}]},'ework-note:r')).toBe(false)
})
it('forks a note-only reply at its exact final event, excludes later note requests and retains native turn boundaries',async()=>{
 const source=patchNoteForkHost(await readFile('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js','utf8'))
 const start=source.indexOf('const events = source.events;',source.indexOf('async fork(request)')),end=source.indexOf('let workspace;',start),branch=new Function('source','atSeq','noteForkBoundary','err','request','const beforeMessageSeq=undefined;'+source.slice(start,end)+'return source.events.slice(0,cut);')
 const events=[{seq:0,type:'workspace-note/edited',data:{}},{seq:1,type:'workspace-note/conversation',data:{requestId:'r',phase:'preparing'}},{seq:2,type:'workspace-note/conversation',data:{requestId:'r',phase:'ready',result:{kind:'text',markdown:'已完成'}}},{seq:3,type:'workspace-note/conversation',data:{requestId:'later',phase:'preparing'}}]
 expect(branch({events},2,noteForkBoundary,()=>null,{}).map(e=>e.seq)).toEqual([0,1,2])
 expect(noteForkBoundary(events,1)).toBeUndefined();expect(noteForkBoundary(events,3)).toBeUndefined()
 const native=[{seq:0,type:'turn/start'},{seq:1,type:'assistant/message'},{seq:2,type:'turn/end'},{seq:3,type:'session/title'},{seq:4,type:'turn/start'}]
 expect(branch({events:native},1,noteForkBoundary,()=>null,{}).map(e=>e.seq)).toEqual([0,1,2,3])
 expect(patchNoteForkHost(source)).toBe(source)
})
