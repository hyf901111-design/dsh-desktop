import { expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
vi.mock('electron',()=>({WebContentsView:vi.fn(),session:{},BrowserWindow:vi.fn(),webContents:{}}))
import { browserRequest, browserCursorScript } from '../src/main/search/conversation-browser'
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
