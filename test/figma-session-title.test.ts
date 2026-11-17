import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { EditableSessionTitle } from '../scripts/lib/figma-session-title.mjs'
const req=createRequire(import.meta.url),React=req('react'),Component=new Function('react','react_jsx_runtime','return '+EditableSessionTitle.toString())(React,req('react/jsx-runtime'))
let cleanup=async()=>{};afterEach(async()=>{await cleanup();vi.unstubAllGlobals()})
async function mount(rename=vi.fn(async()=>{})){
 const w=new Window();vi.stubGlobal('window',w);vi.stubGlobal('document',w.document);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 const host=w.document.createElement('div');w.document.body.appendChild(host);const root=req('react-dom/client').createRoot(host)
 await React.act(async()=>root.render(React.createElement(Component,{children:'原标题',rename,className:'title'})))
 cleanup=async()=>{await React.act(async()=>root.unmount());await w.happyDOM.abort()}
 const event=async(selector:string,type:string,props={})=>React.act(async()=>host.querySelector(selector)!.dispatchEvent(type==='dblclick'?new w.MouseEvent(type,{bubbles:true,...props}):new w.KeyboardEvent(type,{bubbles:true,...props})))
 await event('button','dblclick');return {host,w,rename,event,input:host.querySelector('input')! as any}
}
it('opens on double click and trims/persists Enter once',async()=>{const f=await mount();expect(f.input.value).toBe('原标题');f.input.value='  我的研究  ';await f.event('input','keydown',{key:'Enter'});expect(f.rename).toHaveBeenCalledExactlyOnceWith('我的研究');expect(f.host.querySelector('input')).toBeNull()})
it('cancels Escape and does not save a composing Enter',async()=>{const f=await mount();f.input.value='变更';await f.event('input','keydown',{key:'Enter',isComposing:true});expect(f.rename).not.toHaveBeenCalled();await f.event('input','keydown',{key:'Escape'});expect(f.rename).not.toHaveBeenCalled();expect(f.host.textContent).toBe('原标题')})
it('keeps input and reports a failed save',async()=>{const f=await mount(vi.fn(async()=>{throw Error('保存失败')}));f.input.value='变更';await f.event('input','keydown',{key:'Enter'});expect(f.host.querySelector('input')).not.toBeNull();expect(f.host.querySelector('[role=alert]')?.textContent).toBe('保存失败')})
it('preserves explicit empty-session titles in sidebar projection',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');const {patchFigmaNavigationTitles}=await import('../scripts/lib/figma-refinements-client.mjs');
 const src=patchFigmaNavigationTitles(await readFile('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8'));
 const extract=(name:string)=>{const a=src.indexOf(`function ${name}(`),b=src.indexOf('\n\t\t}',a)+5;return src.slice(a,b)};
 const f=runInNewContext(extract('sessionTitle')+'\n'+extract('displayTitle')+'\n({sessionTitle,displayTitle})',{researchSessionState:()=>({engaged:false})});
 expect(f.sessionTitle({blank:true,title:'自定义标题'})).toBe('自定义标题');expect(f.displayTitle({blank:true,explicitTitle:'自定义标题'},()=> '新会话')).toBe('自定义标题');expect(f.displayTitle({blank:true},()=> '新会话')).toBe('新会话');
})

it('projects the shared board name over a stale local breadcrumb and restricts renaming to its owner',async()=>{
 const {readFile}=await import('node:fs/promises')
 const {patchFigmaSessionTitle}=await import('../scripts/lib/figma-session-title.mjs')
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=patchFigmaSessionTitle(raw)
 expect(patchFigmaSessionTitle(patched)).toBe(patched)
 const project=patched.split('\n').find(line=>line.includes('if(last && collaborativeBoard) summary ='))
 const action=patched.split('\n').find(line=>line.includes('rename: collaborativeBoard &&'))
 expect(project).toBeDefined();expect(action).toBeDefined()
 const crumb=new Function('summary','last','collaborativeBoard','rename',project+'\nreturn {summary,'+action+'};')
 const local={id:'s',displayTitle:'旧会话名'}, rename=vi.fn()
 for(const title of ['开黑测试','更新后的看板']){
  const owner=crumb(local,true,{title,role:'owner'},rename)
  expect(owner.summary.displayTitle).toBe(title)
  owner.rename(title)
  expect(rename).toHaveBeenLastCalledWith('s',title)
  expect(crumb(local,true,{title,role:'editor'},rename).rename).toBeUndefined()
 }
 expect(crumb(local,true,undefined,rename).summary).toBe(local)
})
