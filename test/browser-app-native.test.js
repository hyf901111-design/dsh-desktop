import {expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {installBrowserNative,browserSourceCodec,patchBrowserAppNative,stripBrowserAppNative,browserUserTextSegments} from '../scripts/lib/browser-app-native.mjs'
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

it('opens a link once in a mounted browser and never leaves it queued for the next view mount',async()=>{
 const w=new Window();vi.stubGlobal('window',w);vi.stubGlobal('document',w.document);vi.stubGlobal('CustomEvent',w.CustomEvent)
 w.document.body.innerHTML='<div data-ework-browser-view="A"></div>';const setUrl=vi.fn(),setView=vi.fn(),opens=[]
 w.document.addEventListener('sherlock:browser-open',e=>opens.push(e.detail))
 const off=installBrowserNative({sessions:{list:{getSnapshot:()=>({current:'A'})},subagentAddress:()=>null,open:vi.fn()},chatStore:{create:()=>({actions:{setView}})},setUrl})
 w.dispatchEvent(new w.CustomEvent('sherlock:browser-request',{detail:{url:'https://example.com/'}}));await Promise.resolve()
 expect(setUrl).toHaveBeenCalledWith('A',undefined);expect(opens).toEqual([{sessionId:'A',url:'https://example.com/'}]);expect(setView).toHaveBeenCalledWith('browser')
 const raw=await browserSourceCodec().codec.serialize(JSON.stringify({title:'文章',url:'https://example.com/',at:1}));expect(browserUserTextSegments('问题'+raw)).toEqual([{text:'问题'},{title:'文章',url:'https://example.com/'}])
 off();vi.unstubAllGlobals();await w.happyDOM.abort()
})
