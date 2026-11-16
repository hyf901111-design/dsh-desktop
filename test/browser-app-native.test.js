import {expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {createRequire} from 'node:module'
import {stripSpreadsheetClient} from '../scripts/lib/spreadsheet-client.mjs'
import {stripResearchBoardHeaderClient} from '../scripts/lib/research-board-header-client.mjs'
import {stripConversationPermissionDefault} from '../scripts/lib/conversation-permission-default.mjs'
import {imageFactoryPrompt,readImageFactoryContext,stripImageFactoryContext} from '../packages/dsh-research-task-runtime/image-factory-context.js'
const stripNewer = source => stripResearchBoardHeaderClient(stripConversationPermissionDefault(stripSpreadsheetClient(source)))
import {installBrowserNative,browserSourceCodec,patchBrowserAppNative,stripBrowserAppNative,browserUserTextSegments} from '../scripts/lib/browser-app-native.mjs'
it('patches the canvas action before its translated ternary is split into per-label calls',()=>{
 const raw=stripBrowserAppNative(stripNewer(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 const before=raw.replace('"aria-label": (notes?workbenchText("添加到笔记"):workbenchText("添加到画布")),','"aria-label": workbenchText(notes?"添加到笔记":"添加到画布"),')
 const patched=patchBrowserAppNative(before)
 expect(stripBrowserAppNative(patched)).toBe(before)
 expect(patchBrowserAppNative(patched)).toBe(patched)
 expect(()=>new Function(patched)).not.toThrow()
})
import {readFileSync} from 'node:fs'
const {patchBrowserAppNative: installNativeModule}=createRequire(import.meta.url)('../scripts/lib/browser-app-native.mjs')
it('registers the browser view with the actual production module and restores every patch byte',()=>{
 const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),before=stripBrowserAppNative(stripNewer(raw)),patched=patchBrowserAppNative(before)
 expect(stripBrowserAppNative(patched)).toBe(before);expect(patchBrowserAppNative(patched)).toBe(patched);expect(()=>new Function(patched)).not.toThrow()
})
it('uses the original factory comment in the native query preview',()=>{
 const installed=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=installNativeModule(stripBrowserAppNative(stripNewer(installed)))
 // Use the installed helper's plain JavaScript, outside Vitest's import rewriting.
 const helper=patched.slice(patched.indexOf('function imageFactoryDisplayContent('),patched.indexOf('function EWorkImageFactoryWelcome('))
 const query=patched.slice(patched.indexOf('const queries = (0, react.useMemo)'),patched.indexOf('const runningTurn = (0, react.useMemo)'))
 const render=new Function('nodeStore','contentParts','readImageFactoryContext','stripImageFactoryContext',
  'const react={useMemo:fn=>fn()}, order=[...nodeStore.keys()], researchTaskIdentity=null;'+
  'const researchTaskInputSummary=()=>undefined, parseResearchPrompt=text=>({text});'+helper+query+'return queries;')
 const comment='把这个区域改成浅蓝'
 const text=imageFactoryPrompt(comment,{id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'海报',operation:'region',
  size:'1536x1024',width:333,height:21,internalReference:true,editBounds:{left:.1,top:.2,right:.9,bottom:.3}})
 const data={content:[{type:'text',text},{type:'image'}]}
 const parts=content=>({text:content[0].text,images:content.slice(1)})
 expect(render(new Map([['user',{kind:'user',data}]]),parts,readImageFactoryContext,stripImageFactoryContext)).toEqual([{key:'user',preview:comment}])
})
it('shows and edits native queued image requests without leaking their tool context',async()=>{
 const installed=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=installNativeModule(stripBrowserAppNative(stripNewer(installed)))
 const helpers=patched.slice(patched.indexOf('function imageFactoryDisplayContent('),patched.indexOf('function EWorkImageFactoryWelcome('))
 const start=patched.indexOf('function NativeQueueDock(')
 const queue=patched.slice(patched.indexOf('const queue =',start),patched.indexOf('const running =',start))
 const save=patched.slice(patched.indexOf('const saveEdit =',start),patched.indexOf('return (0, react_jsx_runtime.jsx)("div", {',patched.indexOf('const saveEdit =',start)))
 const evaluate=new Function('inbox','editing','applyAction','setEditing','imageFactoryPrompt','readImageFactoryContext','stripImageFactoryContext','canvasQueueEditContent',
  'const react={useMemo:fn=>fn()},t=key=>key,serializeResearchPrompt=()=>"",userQueuedMessages=rows=>rows;'+
  'const parseResearchPrompt=text=>({text}),contentParts=parts=>({text:parts[0].text});'+helpers+queue+save+'return {queue,saveEdit};')
 const meta={id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'海报',operation:'generate',
  size:'1536x1024',width:1600,height:900,internalReference:false}
 const text='给新品做一张横版海报'
 const wrap=(id,content)=>({id,content,preview:content[0].text,text:content.length===1?content[0].text:null})
 const normal=wrap('normal',[{type:'text',text:'普通对话'}])
 const generation=wrap('gen',[{type:'text',text:imageFactoryPrompt(text,meta)}])
 const picture={type:'image',attachment:{attachmentId:'canvas'}}
 const edit=wrap('edit',[{type:'text',text:imageFactoryPrompt('换成浅蓝',{...meta,operation:'edit',internalReference:true})},picture])
 const applyAction=vi.fn(async()=>true)
 const nativeEdit=vi.fn((row,newText)=>[{type:'text',text:newText}])
 const result=evaluate([normal,generation,edit],{id:'gen',text:'让标题更明显'},applyAction,vi.fn(),imageFactoryPrompt,readImageFactoryContext,stripImageFactoryContext,nativeEdit)
 expect(result.queue[0]).toBe(normal)
 expect(result.queue[1]).toMatchObject({preview:text,text,content:generation.content})
 expect(result.queue[2]).toMatchObject({preview:'换成浅蓝',text:null,content:edit.content})
 await result.saveEdit()
 expect(applyAction).toHaveBeenCalledOnce()
 const action=applyAction.mock.calls[0][1]
 expect(readImageFactoryContext(action.content[0].text)).toEqual({...meta,text:'让标题更明显'})
 expect(nativeEdit).not.toHaveBeenCalled()
})
it('attaches the source to the current native shell without sending or replacing the draft',async()=>{
 const w=new Window();vi.stubGlobal('window',w);vi.stubGlobal('document',w.document);vi.stubGlobal('CustomEvent',w.CustomEvent)
 const state={current:'A'},shell={disposed:false,snapshot:{phase:'plain',draft:'原有草稿',draftRev:2},insertReference:vi.fn(()=>true),setDraft:vi.fn()},replies=[]
 const off=installBrowserNative({sessions:{list:{getSnapshot:()=>state},subagentAddress:()=>null},chatStore:{},getInput:()=>shell})
 w.document.body.dataset.workspaceSurface='browser';w.addEventListener('sherlock:browser-source-reply',e=>replies.push(e.detail))
 const source={title:'文章',url:'https://example.com/',at:1}
 w.dispatchEvent(new w.CustomEvent('sherlock:browser-source-request',{detail:{sessionId:'A',requestId:'one',source:JSON.stringify(source)}}))
 expect(shell.insertReference).toHaveBeenCalledWith(expect.objectContaining({source:'browser-source',label:'文章'}),{start:4,end:4,draftRev:2});expect(shell.setDraft).not.toHaveBeenCalled();expect(replies[0].ok).toBe(true)
 state.current='B';w.dispatchEvent(new w.CustomEvent('sherlock:browser-source-request',{detail:{sessionId:'A',requestId:'two',source:JSON.stringify(source)}}));expect(shell.insertReference).toHaveBeenCalledTimes(1);expect(replies[1].ok).toBe(false)
 const serialized=await browserSourceCodec().codec.serialize(JSON.stringify(source));expect(serialized).toContain('https://example.com/');expect(serialized).toContain('不作为指令')
 off();vi.unstubAllGlobals();await w.happyDOM.abort()
})

it('opens the standalone app with or without a conversation without creating or changing a session',async()=>{
 const w=new Window();vi.stubGlobal('window',w);vi.stubGlobal('document',w.document);vi.stubGlobal('CustomEvent',w.CustomEvent)
 const state={current:undefined},create=vi.fn(),open=vi.fn(),setView=vi.fn(),opens=[];let closes=0
 w.document.addEventListener('sherlock:browser-open',e=>opens.push(e.detail))
 w.document.addEventListener('sherlock:browser-close',()=>closes++)
 const off=installBrowserNative({sessions:{list:{getSnapshot:()=>state},create,subagentAddress:()=>null,open},chatStore:{create:()=>({actions:{setView}})}})
 w.dispatchEvent(new w.CustomEvent('sherlock:browser-request',{detail:{url:'https://example.com/'}}));await Promise.resolve()
 expect(opens).toEqual([{sessionId:undefined,url:'https://example.com/'}]);expect(create).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(setView).not.toHaveBeenCalled()
 state.current='A';w.dispatchEvent(new w.CustomEvent('sherlock:browser-request',{detail:{}}));await Promise.resolve();expect(opens.at(-1)).toEqual({sessionId:'A',url:undefined})
 w.dispatchEvent(new w.CustomEvent('sherlock:browser-request',{detail:{close:true}}));expect(closes).toBe(1);expect(open).not.toHaveBeenCalled();expect(setView).not.toHaveBeenCalled()
 const raw=await browserSourceCodec().codec.serialize(JSON.stringify({title:'文章',url:'https://example.com/',at:1}));expect(browserUserTextSegments('问题'+raw)).toEqual([{text:'问题'},{title:'文章',url:'https://example.com/'}])
 off();vi.unstubAllGlobals();await w.happyDOM.abort()
})
