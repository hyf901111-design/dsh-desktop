import {expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {installBrowserNative,browserSourceCodec,patchBrowserAppNative,stripBrowserAppNative,browserUserTextSegments} from '../scripts/lib/browser-app-native.mjs'
it('patches the canvas action before its translated ternary is split into per-label calls',()=>{
 const raw=stripBrowserAppNative(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const before=raw.replace('"aria-label": (notes?workbenchText("添加到笔记"):workbenchText("添加到画布")),','"aria-label": workbenchText(notes?"添加到笔记":"添加到画布"),')
 const patched=patchBrowserAppNative(before)
 expect(stripBrowserAppNative(patched)).toBe(before)
 expect(patchBrowserAppNative(patched)).toBe(patched)
 expect(()=>new Function(patched)).not.toThrow()
})
import {readFileSync} from 'node:fs'
it('registers the browser view with the actual production module and restores every patch byte',()=>{
 const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),before=stripBrowserAppNative(raw),patched=patchBrowserAppNative(before)
 expect(stripBrowserAppNative(patched)).toBe(before);expect(patchBrowserAppNative(patched)).toBe(patched);expect(()=>new Function(patched)).not.toThrow()
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
