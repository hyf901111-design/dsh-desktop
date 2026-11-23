import {Window,HTMLButtonElement as TestButton} from 'happy-dom'
import {it,expect,vi} from 'vitest'
import filledResearchIcon from '../build/brand/odyssey-app-research.svg?inline'
import filledChatIcon from '../src/preload/browser/assets/chat.svg?inline'
import noteIcon from '../build/brand/odyssey-app-note.svg?inline'
import spreadsheetIcon from '../build/brand/odyssey-app-spreadsheet.svg?inline'
import workspaceAddIcon from '../build/brand/odyssey-b-workspace-add-18.svg?inline'
import {ScheduledTaskView} from '../src/preload/scheduled/view'
import {createHomeGuideEntryClient,installHomeGuideEntryNative} from '../src/preload/home-guide-entry-native'
import {createSidebarNewNoteAction} from '../src/preload/sidebar-new-note'
const fixture=(wide:boolean)=>{
 const w=new Window();vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
 w.document.body.innerHTML=`<aside data-dsh-sidebar-root data-dsh-sidebar-wide="${wide}"><div data-srb-navigation-scroll><button data-sidebar-add-workspace>添加工作区</button></div><div class="hHd-Xa_newSessionGroup"><button class="hHd-Xa_newSession" data-sidebar-home>主页</button></div></aside><main class="pI_x6G_centerCol"></main>`
 const actions={newNote:vi.fn(async()=>{}),newSpreadsheet:vi.fn(async()=>{})}
 const host={register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>undefined},view=new ScheduledTaskView(w.document as any,{list:async()=>[],workspaces:async()=>[],save:vi.fn(),action:vi.fn()},host as any,undefined,actions);view.mount();return {w,view,actions}
}
it('places browser after New Note in expanded More and uses the same open action',async()=>{
 const {w}=fixture(true),open=vi.fn();w.addEventListener('sherlock:browser-request',open)
 try{(w.document.querySelector('.st-more')as any).click();const rows=[...w.document.querySelectorAll<TestButton>('[role=menuitem]')];expect(rows.map(x=>x.textContent)).toEqual(['笔记','表格','浏览器','知识库','图像','插件','定时任务']);rows[2]!.click();expect(open).toHaveBeenCalledOnce()}finally{await w.happyDOM.abort();vi.unstubAllGlobals()}
})
it('opens Image Factory from expanded More and dismisses the menu', async () => {
 const { w } = fixture(true)
 const open = vi.fn()
 w.addEventListener('sherlock:image-factory-open', open)
 const more = w.document.querySelector<TestButton>('.st-more')!
 try {
  more.click()
  const factory = [...w.document.querySelectorAll<TestButton>('[role=menuitem]')].find(item => item.textContent === '图像')!
  expect(factory.querySelector('[data-odyssey-icon=factory]')).toBeTruthy()
  factory.click()
  expect(open).toHaveBeenCalledOnce()
  expect(more.getAttribute('aria-expanded')).toBe('false')
  expect(w.document.querySelector('[data-sidebar-more]')).toBeNull()
 } finally { await w.happyDOM.abort(); vi.unstubAllGlobals() }
})
it('dismisses expanded More even when the canvas stops pointer bubbling', async () => {
 const {w}=fixture(true)
 const more=w.document.querySelector<TestButton>('.st-more')!
 const canvas=w.document.querySelector('main')!
 canvas.addEventListener('pointerdown',event=>event.stopPropagation())
 try {
  more.click()
  expect(more.getAttribute('aria-expanded')).toBe('true')
  canvas.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}))
  expect(more.getAttribute('aria-expanded')).toBe('false')
  expect(w.document.querySelector('[data-sidebar-more]')).toBeNull()
 } finally { await w.happyDOM.abort(); vi.unstubAllGlobals() }
})
it('provides a persistent collapsed browser button and keeps collapsed More focused on other actions',async()=>{
 const {w,view}=fixture(false),open=vi.fn(),openKnowledge=vi.fn();w.addEventListener('sherlock:browser-request',open);w.addEventListener('sherlock:knowledge-open',openKnowledge)
 try{const button=w.document.querySelector<TestButton>('[data-sidebar-browser]');expect(button).not.toBeNull();expect(button!.getAttribute('aria-label')).toBe('浏览器');const group=w.document.querySelector('.hHd-Xa_newSessionGroup')!;expect(group.querySelector('[data-sidebar-app-separator]')).toBeNull();expect(button!.previousElementSibling).toBe(group.querySelector('[data-sidebar-home]'));const knowledge=group.querySelector<TestButton>('[data-sidebar-knowledge]')!;const factory=group.querySelector<TestButton>('[data-sidebar-image-factory]')!;expect(button!.nextElementSibling).toBe(factory);expect(factory.nextElementSibling).toBe(knowledge);const openFactory=vi.fn();w.addEventListener('sherlock:image-factory-open',openFactory);factory.click();expect(openFactory).toHaveBeenCalledOnce();expect(knowledge.nextElementSibling).toBe(group.querySelector('.st-more-zone'));button!.click();expect(open).toHaveBeenCalledOnce();w.document.body.dataset.workspaceSurface='browser';w.document.dispatchEvent(new w.CustomEvent('sherlock:workspace-surface-change'));expect(button!.getAttribute('aria-pressed')).toBe('true');button!.dispatchEvent(new w.MouseEvent('mouseleave'));button!.click();expect(open).toHaveBeenCalledTimes(2);expect(button!.getAttribute('aria-pressed')).toBe('true');knowledge.click();expect(openKnowledge).toHaveBeenCalledOnce();w.document.body.dataset.workspaceSurface='knowledge';w.document.dispatchEvent(new w.CustomEvent('sherlock:workspace-surface-change'));expect(knowledge.getAttribute('aria-pressed')).toBe('true');expect(button!.getAttribute('aria-pressed')).toBe('false');(w.document.querySelector('.st-more')as any).click();expect([...w.document.querySelectorAll('[role=menuitem]')].map(x=>x.textContent)).toEqual(['新建工作区','对话','研究','笔记','表格','插件','定时任务']);w.document.querySelector('aside')!.setAttribute('data-dsh-sidebar-wide','true');(view as any).mountMore();expect(w.document.querySelector('[data-sidebar-browser]')).toBeNull();expect(w.document.querySelector('[data-sidebar-app-separator]')).toBeNull()}finally{await w.happyDOM.abort();vi.unstubAllGlobals()}
})
it('reuses one collapsed browser entry between quick creation and More across sidebar modes',async()=>{
 const {w,view}=fixture(false),open=vi.fn();w.addEventListener('sherlock:browser-request',open)
 try{
  const sidebar=w.document.querySelector('aside')!,group=sidebar.querySelector('.hHd-Xa_newSessionGroup')!
  for(let i=0;i<8;i++){
   sidebar.setAttribute('data-dsh-sidebar-wide',String(i%2===1));(view as any).mountMore();(view as any).mountMore()
   expect(group.querySelectorAll('.st-more-zone')).toHaveLength(1)
   expect(group.querySelectorAll('[data-sidebar-browser]')).toHaveLength(i%2===0?1:0)
   expect(group.querySelectorAll('[data-sidebar-knowledge]')).toHaveLength(i%2===0?1:0)
   expect(group.querySelectorAll('[data-sidebar-image-factory]')).toHaveLength(i%2===0?1:0)
   expect(group.querySelectorAll('[data-sidebar-app-separator]')).toHaveLength(0)
   if(i%2===0){const browser=group.querySelector<TestButton>('[data-sidebar-browser]')!;expect(browser.previousElementSibling).toBe(group.querySelector('[data-sidebar-home]'));const knowledge=group.querySelector('[data-sidebar-knowledge]')!;const factory=group.querySelector('[data-sidebar-image-factory]')!;expect(browser.nextElementSibling).toBe(factory);expect(factory.nextElementSibling).toBe(knowledge);expect(knowledge.nextElementSibling).toBe(group.querySelector('.st-more-zone'))}
  }
  expect(open).not.toHaveBeenCalled()
 }finally{await w.happyDOM.abort();vi.unstubAllGlobals()}
})

it('routes the five collapsed creation entries with the filled sidebar icons', async () => {
 const {w,actions}=fixture(false),workspace=vi.fn(),chat=vi.fn(),research=vi.fn()
 w.document.querySelector('[data-sidebar-add-workspace]')!.addEventListener('click',workspace)
 w.document.querySelector('[data-dsh-sidebar-root]')!.addEventListener('sherlock:sidebar-new-chat',chat)
 w.document.querySelector('[data-dsh-sidebar-root]')!.addEventListener('sherlock:sidebar-new-research',research)
 const more=w.document.querySelector<TestButton>('.st-more')!
 try {
  for (const [label,callback,expectedIcon] of [
   ['新建工作区',workspace,workspaceAddIcon],['对话',chat,filledChatIcon],['研究',research,filledResearchIcon],
   ['笔记',actions.newNote,noteIcon],['表格',actions.newSpreadsheet,spreadsheetIcon]
  ] as const) {
   more.click()
   const item=[...w.document.querySelectorAll<TestButton>('[role=menuitem]')].find(entry=>entry.textContent===label)
   expect(item).toBeTruthy()
   if(expectedIcon)expect(item!.querySelector('.st-icon')?.getAttribute('style'))
    .toBe("--icon:url('" + expectedIcon.replaceAll("'",'%27') + "')")
   item!.click()
   await Promise.resolve()
   expect(callback).toHaveBeenCalledOnce()
   expect(more.getAttribute('aria-expanded')).toBe('false')
  }
 } finally {await w.happyDOM.abort();vi.unstubAllGlobals()}
})

it('closes More as soon as the spreadsheet demo clicks New Spreadsheet',async()=>{
 const {w,actions}=fixture(true),document=w.document as unknown as Document
 const more=document.querySelector<HTMLButtonElement>('.st-more')!
 const entry={sessionId:'demo-spreadsheet',cwd:'/demo',title:'利润涨了，现金去哪了？'}
 const input={snapshot:{phase:'plain',draft:'原会话草稿',draftRev:1}}
 let selected='source'
 const open=vi.fn(()=>{selected=entry.sessionId})
 const ordinaryRequest=vi.fn()
 w.addEventListener('sherlock:sidebar-new-note-request',ordinaryRequest)
 const dispose=installHomeGuideEntryNative({
  document,context:()=>({owner:'owner',generation:1,identityRevision:0,sessionId:selected,input}),
  subscribe:()=>()=>{},prepare:async()=>entry,open
 })
 let release!:()=>void
 const held=new Promise<void>(resolve=>{release=resolve})
 const spreadsheet=createSidebarNewNoteAction(document,()=>held,'spreadsheet')
 actions.newSpreadsheet.mockImplementation(async () => { await spreadsheet.create() })
 const controller=new AbortController()
 let pending:Promise<unknown>|undefined
 try{
  const client=await createHomeGuideEntryClient(document,{runId:'spreadsheet-more-test',kind:'spreadsheet',signal:controller.signal,sourceSessionId:selected})
  const home=document.querySelector<HTMLButtonElement>('[data-sidebar-home]')!
  home.getBoundingClientRect=()=>new w.DOMRect(10,10,100,35) as unknown as DOMRect
  await expect(client.prepare(home,'new-spreadsheet')).rejects.toMatchObject({name:'AbortError'})
  more.click()
  expect(more.getAttribute('aria-expanded')).toBe('true')
  const menu=document.querySelector('[data-sidebar-more]')!
  const target=[...menu.querySelectorAll('button')].find(button=>button.textContent==='表格')!
  target.getBoundingClientRect=()=>new w.DOMRect(10,10,100,35) as unknown as DOMRect
  await client.prepare(target,'new-spreadsheet')
  pending=client.commit(target)
  expect(document.querySelector('[data-sidebar-more]')).toBeNull()
  expect(more.getAttribute('aria-expanded')).toBe('false')
  expect(selected).toBe('source')
  release()
  await expect(pending).resolves.toMatchObject(entry)
  expect(actions.newSpreadsheet).toHaveBeenCalledOnce()
  await actions.newSpreadsheet.mock.results[0]!.value
  expect(open).toHaveBeenCalledExactlyOnceWith(entry,'spreadsheet',expect.any(Function))
  expect(ordinaryRequest).not.toHaveBeenCalled()
  expect(document.querySelector('[data-sidebar-more]')).toBeNull()
 }finally{
  controller.abort()
  release()
  await pending?.catch(()=>{})
  spreadsheet.dispose()
  dispose()
  await w.happyDOM.abort()
  vi.unstubAllGlobals()
 }
})

it.each([['board','研究','new-research'],['workbench','研究','new-research'],['ppt','对话','new-chat'],['report','对话','new-chat']] as const)('closes More and opens only the prepared %s through its matching action',async(kind,label,action)=>{
 const {w}=fixture(false),document=w.document as unknown as Document
 const more=document.querySelector<HTMLButtonElement>('.st-more')!
 const home=document.querySelector<HTMLButtonElement>('[data-sidebar-home]')!
 const ordinaryAction=vi.fn()
 home.addEventListener('click',ordinaryAction)
 document.querySelector('[data-dsh-sidebar-root]')!.addEventListener('sherlock:sidebar-new-research',ordinaryAction)
 const entry={sessionId:'demo',cwd:'/demo',title:'示例'}
 let selected='source'
 const input={snapshot:{phase:'plain',draft:'原会话草稿',draftRev:1}}
 const open=vi.fn(()=>{selected=entry.sessionId})
 const dispose=installHomeGuideEntryNative({
  document,context:()=>({owner:'owner',generation:1,identityRevision:0,sessionId:selected,input}),
  subscribe:()=>()=>{},prepare:async()=>entry,open
 })
 const controller=new AbortController()
 try{
  const client=await createHomeGuideEntryClient(document,{runId:kind+'-more-test',kind,signal:controller.signal,sourceSessionId:selected})
  home.getBoundingClientRect=()=>new w.DOMRect(10,10,100,35) as unknown as DOMRect
  await expect(client.prepare(home,action)).rejects.toMatchObject({name:'AbortError'})
  more.click()
  const target=[...document.querySelectorAll<HTMLButtonElement>('[data-sidebar-more] [role="menuitem"]')].find(button=>button.textContent===label)!
  target.getBoundingClientRect=()=>new w.DOMRect(10,10,100,35) as unknown as DOMRect
  await client.prepare(target,action)
  const pending=client.commit(target)
  expect(document.querySelector('[data-sidebar-more]')).toBeNull()
  expect(more.getAttribute('aria-expanded')).toBe('false')
  await expect(pending).resolves.toMatchObject(entry)
  expect(open).toHaveBeenCalledExactlyOnceWith(entry,kind,expect.any(Function))
  expect(ordinaryAction).not.toHaveBeenCalled()
 }finally{
  controller.abort()
  dispose()
  await w.happyDOM.abort()
  vi.unstubAllGlobals()
 }
})
