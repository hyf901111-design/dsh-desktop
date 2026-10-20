import { expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
vi.mock('electron',()=>({WebContentsView:vi.fn(),session:{},BrowserWindow:vi.fn(),webContents:{}}))
import { browserRequest, browserCursorScript, fittedBrowserZoom } from '../src/main/search/conversation-browser'
it('requires an execution session and admits only the finite web operation API',()=>{
  expect(browserRequest({sessionId:'s',op:'open',url:'https://www.baidu.com'}).op).toBe('open')
  for(const v of [{op:'open',url:'https://www.baidu.com'},{sessionId:'s',op:'evaluate',code:'anything'},{sessionId:'s',op:'open',url:'file:///etc/passwd'},{sessionId:'s',op:'open',url:'http://127.0.0.1:4000'}])expect(()=>browserRequest(v)).toThrow()
})
it('keeps one visible non-intercepting cursor without adding its label to source text',async()=>{
  const win=new Window({width:800,height:600});win.document.body.innerHTML='<main>原网页正文</main>'
  win.eval(browserCursorScript(.3,.4,'Agent · 输入'))
  win.eval(browserCursorScript(.5,.6,'Agent · 等待页面'))
  const cursor=win.document.querySelector('[data-odyssey-browser-cursor]') as unknown as HTMLElement
  expect(win.document.querySelectorAll('[data-odyssey-browser-cursor]')).toHaveLength(1)
  expect(cursor.style.pointerEvents).toBe('none')
  expect(cursor.style.left).toBe('400px')
  expect(win.document.body.textContent).toBe('原网页正文')
  win.eval(browserCursorScript(.99,.99,'Agent · 点击'))
  expect(cursor.style.left).toBe('792px')
  expect(cursor.style.top).toBe('594px')
  await win.happyDOM.abort()
})

it('shares the canvas cursor presentation and fades only on lifecycle inactivity',async()=>{
  const win=new Window({width:320,height:600})
  win.eval(browserCursorScript(.5,.5,'hyf90的智能助理',true,2))
  const cursor=win.document.querySelector('[data-odyssey-browser-cursor]') as any
  expect(cursor.__pointer.querySelector('path').getAttribute('fill')).toBe('rgba(135,135,135,.5)')
  expect(cursor.__label.textContent).toBe('hyf90的智能助理')
  expect(cursor.style.transform).toBe('scale(2)')
  expect(cursor.style.opacity).toBe('1')
  win.eval(browserCursorScript(.5,.5,'hyf90的智能助理',false,2))
  expect(cursor.style.opacity).toBe('0')
  expect(cursor.style.transition).toContain('opacity')
  // Resizing/navigation does not resurrect a completed task's cursor.
  win.eval(browserCursorScript(.1,.1,'hyf90的智能助理',false,1))
  expect(cursor.style.opacity).toBe('0')
  win.eval(browserCursorScript(.1,.1,'hyf90的智能助理',true,1))
  expect(cursor.style.opacity).toBe('1')
  await win.happyDOM.abort()
})

it('fits desktop overflow while retaining responsive page scale and stable fitted sizes',()=>{
  expect(fittedBrowserZoom(1,1,320,1000)).toBe(.32)
  expect(fittedBrowserZoom(1,.32,1000,1000)).toBe(.32)
  expect(fittedBrowserZoom(1,1,640,640)).toBe(1)
  expect(fittedBrowserZoom(1.25,1.25,320,1000)).toBe(.4)
  expect(fittedBrowserZoom(1,1,0,1000)).toBe(1)
})

it('follows session completion even while another tab is selected and keeps persistent tasks visible',async()=>{
  // @ts-ignore Frontend patch module is plain JavaScript.
  const {patchConversationBrowser}=await import('../scripts/lib/conversation-browser-client.mjs')
  const source=patchConversationBrowser('class ResearchSidebarCoordinator { attach(){ const unregisterGenerated=service.registerTab({}); return()=>{unregisterGenerated?.();}; }}')
  let receive:any,changed:any,taskChanged:any
  const updates:any[]=[],row={running:true},tasks={value:[] as any[],retain:()=>()=>{},subscribe:(fn:any)=>{taskChanged=fn;return()=>{}}}
  const code=source.slice(source.indexOf('const browserSessions='),source.indexOf('const unregisterGenerated='))
  new Function('sessions','window','sherlockBoardsAdapter','canvasTaskStore','service',code)(
    {list:{getSnapshot:()=>({byId:{s:row},current:'another-session'}),subscribe:(fn:any)=>{changed=fn;return()=>{}}}},
    {dshDesktop:{conversationBrowser:{subscribe:(fn:any)=>{receive=fn;return()=>{}},activity:async(v:any)=>updates.push(v)}}},
    {getState:()=>({account:{user:{username:'hyf90'}}})},()=>tasks,{openTab:vi.fn(),setPanelState:vi.fn()})
  receive({open:true,sessionId:'s'})
  expect(updates.at(-1)).toEqual({sessionId:'s',active:true,name:'hyf90的智能助理'})
  row.running=false;changed();expect(updates.at(-1).active).toBe(false)
  tasks.value=[{state:'waiting'}];taskChanged();expect(updates.at(-1).active).toBe(true)
  changed();expect(updates).toHaveLength(3)
  tasks.value=[{state:'stopped'}];taskChanged();expect(updates.at(-1).active).toBe(false)
  expect(patchConversationBrowser(source)).toBe(source)
})

it('keeps link failure feedback above native pages when upgrading an existing browser patch',async()=>{
  // @ts-ignore Frontend patch module is plain JavaScript.
  const {patchConversationBrowser}=await import('../scripts/lib/conversation-browser-client.mjs')
  const source=patchConversationBrowser('class ResearchSidebarCoordinator { attach(){ const unregisterGenerated=service.registerTab({}); return()=>{unregisterGenerated?.();}; }}')
  const legacy=source.replace('dialog[open],[aria-modal=true],[role=menu],[data-ework-web-link-error]','dialog[open],[aria-modal=true],[role=menu]')
  const upgraded=patchConversationBrowser(legacy)
  expect(upgraded).toContain('dialog[open],[aria-modal=true],[role=menu],[data-ework-web-link-error]')
  expect(patchConversationBrowser(upgraded)).toBe(upgraded)
})
