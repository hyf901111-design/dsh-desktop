import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host';
import { IntegrationView } from '../src/preload/integrations/view';
import type { IntegrationReply } from '../src/preload/integrations/bridge';
const windows: Window[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.happyDOM.abort()); });
it('keeps the browser resident when opening settings and selecting its current session', async () => {
    const w=new Window();windows.push(w);const doc=w.document as unknown as Document;
    doc.body.innerHTML='<main class="pI_x6G_centerCol"></main><button class="VOzbGW_trigger">设置</button><aside data-dsh-sidebar-root><button role="row">当前会话</button></aside>';
    const host=new WorkspaceSurfaceHost(doc),browser=doc.createElement('section');browser.innerHTML='<input value="尚未提交的网址">';host.register('browser',browser);host.open('browser');
    doc.querySelector<HTMLButtonElement>('.VOzbGW_trigger')!.click();expect(host.current()?.surface).toBe('browser');
    const overlay=doc.createElement('div');overlay.className='VOzbGW_overlay';doc.body.append(overlay);await new Promise(resolve=>setTimeout(resolve,20));expect(host.current()?.surface).toBe('browser');
    overlay.remove();doc.querySelector<HTMLButtonElement>('[role=row]')!.click();expect(browser.hidden).toBe(false);expect(browser.querySelector('input')!.value).toBe('尚未提交的网址');host.dispose();
});
it('returns to the previous surface without replacing its draft DOM', () => {
    const w = new Window();
    windows.push(w);
    const doc = w.document as unknown as Document;
    doc.body.innerHTML = '<main class="pI_x6G_centerCol"><textarea>会话草稿</textarea></main>';
    const host = new WorkspaceSurfaceHost(doc);
    const scheduled = doc.createElement('section');
    scheduled.innerHTML = '<textarea>定时任务草稿</textarea>';
    const integrations = doc.createElement('section');
    host.register('scheduled', scheduled);
    host.register('integrations', integrations);
    host.open('scheduled');
    host.open('integrations');
    expect(scheduled.hidden).toBe(true);
    host.back();
    expect(scheduled.hidden).toBe(false);
    expect(scheduled.querySelector('textarea')!.value).toBe('定时任务草稿');
    host.back();
    expect(doc.querySelector<HTMLTextAreaElement>('.pI_x6G_centerCol textarea')!.value).toBe('会话草稿');
    expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(false);
    host.dispose();
});
it('preserves surface through search overlay and panel toggle; only an opened session closes it', () => {
    const w = new Window();
    windows.push(w);
    const doc = w.document as unknown as Document;
    const host = new WorkspaceSurfaceHost(doc);
    const surface = doc.createElement('section');
    surface.innerHTML = '<input value="未保存地址">';
    host.register('integrations', surface);
    host.open('integrations');
    doc.dispatchEvent(new w.CustomEvent('sherlock:search-open') as unknown as Event);
    host.setRightPaneExpanded(false);
    host.setRightPaneExpanded(true);
    expect(surface.hidden).toBe(false);
    expect(surface.querySelector('input')!.value).toBe('未保存地址');
    doc.dispatchEvent(new w.CustomEvent('sherlock:search-session-opened') as unknown as Event);
    expect(surface.hidden).toBe(true);
    host.dispose();
});
it('reveals the conversation from nested management pages while retaining their drafts', () => {
    const w = new Window(); windows.push(w);
    const doc = w.document as unknown as Document;
    doc.body.innerHTML = '<main class="pI_x6G_centerCol"><textarea>会话草稿</textarea></main>';
    const host = new WorkspaceSurfaceHost(doc);
    const scheduled = doc.createElement('section'), integrations = doc.createElement('section');
    scheduled.innerHTML = '<textarea>未提交的定时任务</textarea>';
    host.register('scheduled', scheduled); host.register('integrations', integrations);
    host.open('scheduled'); host.open('integrations');
    host.revealConversation();
    expect(host.current()).toBeUndefined();
    expect(scheduled.hidden).toBe(true); expect(integrations.hidden).toBe(true);
    expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(false);
    host.open('scheduled');
    expect(scheduled.querySelector('textarea')!.value).toBe('未提交的定时任务');
    expect(doc.querySelector('textarea')!.value).toBe('会话草稿');
    host.dispose();
});
it('updates existing surfaces when the native body theme changes',async()=>{
 const w=new Window();windows.push(w);const doc=w.document as unknown as Document;const host=new WorkspaceSurfaceHost(doc);const surface=doc.createElement('section');host.register('integrations',surface);host.open('integrations');expect(surface.dataset.dark).toBe('false');doc.body.setAttribute('data-ds-dark-theme','');await w.happyDOM.whenAsyncComplete();expect(surface.dataset.dark).toBe('true');doc.body.removeAttribute('data-ds-dark-theme');await w.happyDOM.whenAsyncComplete();expect(surface.dataset.dark).toBe('false');host.dispose()
})

it('waits for native pane confirmation and ignores late acknowledgements after leaving', () => {
    const w = new Window(); windows.push(w);
    const doc = w.document as unknown as Document;
    const host = new WorkspaceSurfaceHost(doc), surface = doc.createElement('section');
    host.register('integrations', surface); host.open('integrations');
    host.setRightPaneExpanded(true);
    expect(host.isRightPaneExpanded()).toBe(false);
    expect(doc.body.dataset.workspaceRightExpanded).not.toBe('true');
    w.dispatchEvent(new w.CustomEvent('sherlock:workspace-panel-state', {detail:{surface:'integrations',open:true}}));
    expect(host.isRightPaneExpanded()).toBe(true);
    expect(doc.body.dataset.workspaceRightExpanded).toBe('true');
    host.close('integrations');
    w.dispatchEvent(new w.CustomEvent('sherlock:workspace-panel-state', {detail:{surface:'integrations',open:false}}));
    expect(doc.body.hasAttribute('data-workspace-right-expanded')).toBe(false);
    host.dispose();
});

it('leaves all workspace surfaces before native settings opens and never restores them when settings closes',()=>{
 const w=new Window();windows.push(w);const doc=w.document as unknown as Document;
 doc.body.innerHTML='<aside data-dsh-sidebar-root><button class="sherlock-account-button">头像</button><button class="VOzbGW_trigger">设置</button></aside><main class="pI_x6G_centerCol"><textarea>对话草稿</textarea></main>';
 const host=new WorkspaceSurfaceHost(doc),scheduled=doc.createElement('section'),integrations=doc.createElement('section');host.register('scheduled',scheduled);host.register('integrations',integrations);host.open('scheduled');host.open('integrations');
 doc.querySelector<HTMLButtonElement>('.sherlock-account-button')!.click();expect(host.current()?.surface).toBe('integrations');
 doc.querySelector('.VOzbGW_trigger')!.addEventListener('click',()=>{expect(host.current()).toBeUndefined();expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(false);doc.body.insertAdjacentHTML('beforeend','<div class="VOzbGW_overlay"><div class="VOzbGW_panel">账户设置</div></div>')});
 doc.querySelector<HTMLButtonElement>('.VOzbGW_trigger')!.click();expect(scheduled.hidden).toBe(true);expect(integrations.hidden).toBe(true);expect(doc.body.hasAttribute('data-workspace-surface')).toBe(false);expect(doc.querySelector('.pI_x6G_centerCol')!.hasAttribute('data-workspace-surface-hidden')).toBe(false);
 host.open('integrations');expect(host.current()).toBeUndefined();expect(integrations.hidden).toBe(true);doc.querySelector('.VOzbGW_overlay')!.remove();host.back();expect(host.current()).toBeUndefined();expect(integrations.hidden).toBe(true);expect(doc.querySelector('textarea')!.value).toBe('对话草稿');host.dispose();
});
it('observes settings opened without a click and retains the previous native inert state',async()=>{
 const w=new Window();windows.push(w);const doc=w.document as unknown as Document;doc.body.innerHTML='<main class="pI_x6G_centerCol"></main>';const center=doc.querySelector<HTMLElement>('main')!;center.inert=true;
 const host=new WorkspaceSurfaceHost(doc),surface=doc.createElement('section');host.register('integrations',surface);host.open('integrations');doc.body.insertAdjacentHTML('beforeend','<div class="VOzbGW_overlay"><div class="VOzbGW_panel">通用设置</div></div>');await w.happyDOM.whenAsyncComplete();expect(host.current()).toBeUndefined();expect(surface.hidden).toBe(true);expect(center.inert).toBe(true);expect(center.hasAttribute('data-workspace-surface-hidden')).toBe(false);doc.querySelector('.VOzbGW_overlay')!.remove();await w.happyDOM.whenAsyncComplete();expect(surface.hidden).toBe(true);host.dispose();
});

it('cancels skill detail work when entering settings and ignores late reads or composer failures',async()=>{
 for(const mode of ['read','use'] as const){
  const w=new Window();windows.push(w);const doc=w.document as unknown as Document;doc.body.innerHTML='<aside data-dsh-sidebar-root><button class="VOzbGW_trigger">设置</button></aside><main class="pI_x6G_centerCol"><textarea>会话草稿</textarea></main>';
  let resolveRead!:(reply:IntegrationReply)=>void,rejectUse!:(error:Error)=>void,signal:AbortSignal|undefined;
  const host=new WorkspaceSurfaceHost(doc),view=new IntegrationView(doc,{request:async command=>command.type==='snapshot'?{type:'snapshot',snapshot:{revision:1,rows:[{id:'s',kind:'skill',tab:'skills',name:'个人技能',description:'',enabled:true,status:'已启用',source:'个人',revision:1}]}}:mode==='read'?new Promise(resolve=>{resolveRead=resolve}):{type:'skill-detail',id:'s',revision:1,enabled:true,content:'# 当前正文',invocationName:'skill'},useSkill:async input=>{signal=input.signal;await new Promise<void>((_,reject)=>{rejectUse=reject})}},host);
  const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};await view.open('integrations/skills');doc.querySelector<HTMLButtonElement>('[data-detail=s]')!.click();await settle();if(mode==='use'){doc.querySelector<HTMLButtonElement>('[data-action=use-skill]')!.click();expect(signal?.aborted).toBe(false)}
  doc.querySelector('.VOzbGW_trigger')!.addEventListener('click',()=>doc.body.insertAdjacentHTML('beforeend','<div class="VOzbGW_overlay"><div class="VOzbGW_panel">账户信息</div></div>'));
  doc.querySelector<HTMLButtonElement>('.VOzbGW_trigger')!.click();expect(host.current()).toBeUndefined();expect(doc.querySelector<HTMLElement>('.ig-root')!.hidden).toBe(true);expect(doc.querySelector<HTMLElement>('.pI_x6G_centerCol')!.inert).toBe(false);
  if(mode==='read')resolveRead({type:'skill-detail',id:'s',revision:1,enabled:true,content:'# 过期私有正文',invocationName:'skill'});else{expect(signal?.aborted).toBe(true);rejectUse(Error('过期使用错误'))}await settle();expect(doc.body.textContent).not.toContain('过期');doc.querySelector('.VOzbGW_overlay')!.remove();await w.happyDOM.whenAsyncComplete();host.back();expect(doc.querySelector<HTMLElement>('.ig-root')!.hidden).toBe(true);view.dispose();host.dispose();
 }
});

it('keeps the native notes header interactive and positions content below it without moving chrome', () => {
 const w = new Window(); windows.push(w); const doc = w.document as unknown as Document;
 Object.defineProperty(w,'innerWidth',{value:1380});Object.defineProperty(w,'innerHeight',{value:900});
 doc.body.innerHTML='<main class="pI_x6G_centerCol"><header data-ework-notes-session="session" data-srb-tabs><button data-conversation-view-id="chat">对话</button><button data-conversation-view-id="notes">笔记</button></header><textarea>原对话草稿</textarea></main><button id="right-toggle">展开右栏</button>';
 const center=doc.querySelector<HTMLElement>('main')!,header=doc.querySelector<HTMLElement>('header')!,toggle=doc.getElementById('right-toggle')!;
 center.getBoundingClientRect=()=>({left:88,right:1370,top:10,bottom:890} as DOMRect);header.getBoundingClientRect=()=>({left:88,right:1370,top:10,bottom:56} as DOMRect);
 const host=new WorkspaceSurfaceHost(doc),notes=doc.createElement('section'),other=doc.createElement('section');host.register('notes',notes);host.register('integrations',other);host.open('notes');
 expect(center.inert).toBe(false);expect(doc.querySelector('header')).toBe(header);expect(doc.getElementById('right-toggle')).toBe(toggle);
 expect(notes.style.top).toBe('56px');expect(notes.style.left).toBe('88px');expect(notes.style.right).toBe('10px');
 header.querySelector<HTMLButtonElement>('[data-conversation-view-id=chat]')!.click();expect(host.current()).toBeUndefined();expect(doc.querySelector('textarea')!.value).toBe('原对话草稿');
 host.open('integrations');expect(center.inert).toBe(true);host.close('integrations');expect(center.inert).toBe(false);host.dispose();
});

it('observes notes geometry when the native sidebar and center mount after the host', async () => {
 const w=new Window();windows.push(w);const doc=w.document as unknown as Document;Object.defineProperty(w,'innerWidth',{value:1380});Object.defineProperty(w,'innerHeight',{value:900});
 let resized!:()=>void;const observed=new Set<Element>();Object.defineProperty(w,'ResizeObserver',{value:class {constructor(callback:()=>void){resized=callback}observe(element:Element){observed.add(element)}disconnect(){}}});
 const host=new WorkspaceSurfaceHost(doc),notes=doc.createElement('section');host.register('notes',notes);
 doc.body.insertAdjacentHTML('afterbegin','<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"><header data-ework-notes-session="session"></header></main>');
 const center=doc.querySelector<HTMLElement>('main')!,header=doc.querySelector<HTMLElement>('header')!;let right=1370;
 center.getBoundingClientRect=()=>({left:88,right,top:10,bottom:890} as DOMRect);header.getBoundingClientRect=()=>({bottom:54} as DOMRect);
 host.open('notes');await w.happyDOM.whenAsyncComplete();expect(observed.has(center)).toBe(true);expect(observed.has(header)).toBe(true);expect(observed.has(doc.querySelector('aside')!)).toBe(true);
 right=1030;resized();await w.happyDOM.whenAsyncComplete();expect(notes.style.right).toBe('350px');host.dispose();
});

it('does not measure hidden surfaces during ordinary tab and streaming mutations',async()=>{
 const w=new Window();windows.push(w);const doc=w.document as unknown as Document;
 doc.body.innerHTML='<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"><header data-ework-notes-session="session"></header></main>';
 const host=new WorkspaceSurfaceHost(doc),notes=doc.createElement('section');host.register('notes',notes);
 const measure=vi.spyOn(doc.querySelector('aside')!,'getBoundingClientRect');
 for(let i=0;i<5;i++){doc.querySelector('main')!.className='pI_x6G_centerCol view-'+i;await w.happyDOM.whenAsyncComplete()}
 expect(measure).not.toHaveBeenCalled();
 host.open('notes');expect(measure).toHaveBeenCalledTimes(1);
 host.close('notes');measure.mockClear();doc.querySelector('main')!.append(doc.createElement('p'));await w.happyDOM.whenAsyncComplete();expect(measure).not.toHaveBeenCalled();host.dispose();
});

it('keeps a native notes view visible when reopening its current session or ordinary settings', async () => {
 const w=new Window();windows.push(w);const doc=w.document as unknown as Document;
 doc.body.innerHTML='<aside data-dsh-sidebar-root><div role="row">当前会话</div><button class="VOzbGW_trigger">设置</button></aside><main class="pI_x6G_centerCol"><header data-ework-notes-session="session"></header><div data-ework-note-view="session"></div></main>';
 const host=new WorkspaceSurfaceHost(doc),notes=doc.createElement('section');host.register('notes',notes);host.open('notes');
 doc.querySelector<HTMLElement>('[role=row]')!.click();doc.dispatchEvent(new w.CustomEvent('sherlock:search-session-opened') as unknown as Event);expect(host.current()?.surface).toBe('notes');expect(notes.hidden).toBe(false);
 doc.querySelector<HTMLButtonElement>('.VOzbGW_trigger')!.click();doc.body.insertAdjacentHTML('beforeend','<div class="VOzbGW_overlay"></div>');await w.happyDOM.whenAsyncComplete();expect(host.current()?.surface).toBe('notes');doc.querySelector('.VOzbGW_overlay')!.remove();await w.happyDOM.whenAsyncComplete();expect(notes.hidden).toBe(false);host.close('notes');expect(notes.hidden).toBe(true);host.dispose();
});
