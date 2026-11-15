import {Window,HTMLButtonElement as TestButton} from 'happy-dom'
import {it,expect,vi} from 'vitest'
import {ScheduledTaskView} from '../src/preload/scheduled/view'
const fixture=(wide:boolean)=>{
 const w=new Window();vi.stubGlobal('MutationObserver',w.MutationObserver);vi.stubGlobal('CustomEvent',w.CustomEvent)
 w.document.body.innerHTML=`<aside data-dsh-sidebar-root data-dsh-sidebar-wide="${wide}"><div class="hHd-Xa_newSessionGroup"><button class="hHd-Xa_newSession" data-sidebar-home>主页</button></div></aside><main class="pI_x6G_centerCol"></main>`
 const host={register:vi.fn(),open:vi.fn(),close:vi.fn(),current:()=>undefined},view=new ScheduledTaskView(w.document as any,{list:async()=>[],workspaces:async()=>[],save:vi.fn(),action:vi.fn()},host as any,undefined,{newNote:async()=>{}});view.mount();return {w,view}
}
it('places browser after New Note in expanded More and uses the same open action',async()=>{
 const {w}=fixture(true),open=vi.fn();w.addEventListener('sherlock:browser-request',open)
 try{(w.document.querySelector('.st-more')as any).click();const rows=[...w.document.querySelectorAll<TestButton>('[role=menuitem]')];expect(rows.map(x=>x.textContent)).toEqual(['新笔记','浏览器','知识库','插件','定时任务']);rows[1]!.click();expect(open).toHaveBeenCalledOnce()}finally{await w.happyDOM.abort();vi.unstubAllGlobals()}
})
it('provides a persistent collapsed browser button and keeps collapsed More focused on other actions',async()=>{
 const {w,view}=fixture(false),open=vi.fn(),openKnowledge=vi.fn();w.addEventListener('sherlock:browser-request',open);w.addEventListener('sherlock:knowledge-open',openKnowledge)
 try{const button=w.document.querySelector<TestButton>('[data-sidebar-browser]');expect(button).not.toBeNull();expect(button!.getAttribute('aria-label')).toBe('浏览器');const group=w.document.querySelector('.hHd-Xa_newSessionGroup')!;expect(group.querySelector('[data-sidebar-app-separator]')).toBeNull();expect(button!.previousElementSibling).toBe(group.querySelector('[data-sidebar-home]'));const knowledge=group.querySelector<TestButton>('[data-sidebar-knowledge]')!;expect(button!.nextElementSibling).toBe(knowledge);expect(knowledge.nextElementSibling).toBe(group.querySelector('.st-more-zone'));button!.click();expect(open).toHaveBeenCalledOnce();w.document.body.dataset.workspaceSurface='browser';w.document.dispatchEvent(new w.CustomEvent('sherlock:workspace-surface-change'));expect(button!.getAttribute('aria-pressed')).toBe('true');button!.dispatchEvent(new w.MouseEvent('mouseleave'));button!.click();expect(open).toHaveBeenCalledTimes(2);expect(button!.getAttribute('aria-pressed')).toBe('true');knowledge.click();expect(openKnowledge).toHaveBeenCalledOnce();w.document.body.dataset.workspaceSurface='knowledge';w.document.dispatchEvent(new w.CustomEvent('sherlock:workspace-surface-change'));expect(knowledge.getAttribute('aria-pressed')).toBe('true');expect(button!.getAttribute('aria-pressed')).toBe('false');(w.document.querySelector('.st-more')as any).click();expect([...w.document.querySelectorAll('[role=menuitem]')].map(x=>x.textContent)).toEqual(['插件','定时任务']);w.document.querySelector('aside')!.setAttribute('data-dsh-sidebar-wide','true');(view as any).mountMore();expect(w.document.querySelector('[data-sidebar-browser]')).toBeNull();expect(w.document.querySelector('[data-sidebar-app-separator]')).toBeNull()}finally{await w.happyDOM.abort();vi.unstubAllGlobals()}
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
   expect(group.querySelectorAll('[data-sidebar-app-separator]')).toHaveLength(0)
   if(i%2===0){const browser=group.querySelector<TestButton>('[data-sidebar-browser]')!;expect(browser.previousElementSibling).toBe(group.querySelector('[data-sidebar-home]'));const knowledge=group.querySelector('[data-sidebar-knowledge]')!;expect(browser.nextElementSibling).toBe(knowledge);expect(knowledge.nextElementSibling).toBe(group.querySelector('.st-more-zone'))}
  }
  expect(open).not.toHaveBeenCalled()
 }finally{await w.happyDOM.abort();vi.unstubAllGlobals()}
})
