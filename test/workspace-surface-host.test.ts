import { Window } from 'happy-dom';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host';
const windows: Window[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.happyDOM.abort()); });
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
