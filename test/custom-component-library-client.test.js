import { afterEach, it, expect, vi } from 'vitest';
import { financialClientFixture } from './helpers/financial-widget-client-fixture.js';
let current;
afterEach(async () => { if (current)
    await current.dispose(); current = null; });
async function fixture() {
    let items = [];
    const node = { id: 'template', kind: 'generated-container', title: '测试组件', displayName: '测试组件', excerpt: '可复用的内容', containerPrompt: '生成测试组件', refreshMinutes: 0, generationStatus: 'completed', containerSpec: { version: 1, type: 'html', title: '测试组件', html: '<main>可复用的内容</main>' }, x: 0, y: 0, width: 400, height: 280, sizeMode: 'manual' };
    const request = vi.fn(async (args) => { if (args.action === 'list')
        return items.map(({ id, name }) => ({ id, name })); if (args.action === 'save') {
        items = [{ id: 'entry-one', name: '测试组件' }];
        return items[0];
    } ; if (args.action === 'read')
        return { node: { ...node, title: items[0].name, displayName: items[0].name } }; if (args.action === 'rename') {
        items[0].name = args.name;
        return items[0];
    } ; if (args.action === 'remove') {
        items = [];
        return { ok: true };
    } });
    const f = await financialClientFixture({ componentLibrary: { request } });
    current = f;
    await f.act(async () => { const n = f.workspace.createContainerDraft(); f.workspace.setArtifacts([{ ...n, ...node, id: n.id }]); });
    return { ...f, request, template: node };
}
async function open(f) { await f.event('click', f.document.querySelector('[data-financial-library]')); await vi.waitFor(() => expect(f.document.querySelector('.ew-financial-library')).not.toBeNull()); }
async function save(f) { await f.event('click', f.host.querySelector('[data-workbench-more]')); const button = f.document.querySelector('[data-workbench-save-library]'); expect(button).not.toBeNull(); await f.event('click', button); expect(f.request).toHaveBeenCalledWith({ action: 'save', sessionId: 'financial-test', nodeId: f.workspace.getSnapshot().artifacts[0].id }); }
it('保存成功显示提示并触发本会话图标微动效，连续保存可重播且提示自动消失',async()=>{
    const f=await fixture();await save(f);
    const trigger=f.document.querySelector('[data-financial-library]');
    expect(f.document.querySelector('[data-library-save-notice]').textContent).toBe('已添加至组件库');
    expect(f.document.querySelector('[data-library-save-notice]').getAttribute('role')).toBe('status');
    const first=trigger.dataset.librarySaved;expect(first).toBeTruthy();
    await save(f);expect(trigger.dataset.librarySaved).not.toBe(first);
    await f.act(async()=>f.win.dispatchEvent(new f.win.CustomEvent('ework-component-library-saved',{detail:{sessionId:'other-board'}})));
    expect(trigger.dataset.librarySaved).toBe('2');
    await f.act(()=>new Promise(resolve=>setTimeout(resolve,2600)));
    expect(f.document.querySelector('[data-library-save-notice]')).toBeNull();expect(trigger.hasAttribute('data-library-saved')).toBe(false);
});
it('保存失败保留错误说明，不显示成功提示或触发图标动效',async()=>{
    const f=await fixture();f.request.mockRejectedValueOnce(Error('磁盘不可用'));
    await f.event('click',f.host.querySelector('[data-workbench-more]'));await f.event('click',f.document.querySelector('[data-workbench-save-library]'));
    expect(f.document.querySelector('[data-library-save-notice]')).toBeNull();
    expect(f.document.querySelector('[data-financial-library]').hasAttribute('data-library-saved')).toBe(false);
    expect(f.document.querySelector('[role=alert]').textContent).toContain('磁盘不可用');
});
it('生成组件从更多菜单保存，独立分类统一图标，跨看板创建副本不触发模型生成', async () => {
    const f = await fixture();
    await save(f);
    await open(f);
    const section = f.document.querySelector('[data-custom-library]');
    expect(section.textContent).toContain('自定义');
    const item = section.querySelector('[data-custom-component]');
    expect(item.textContent).toContain('测试组件');
    expect(item.querySelector('[data-financial-icon=custom]')).not.toBeNull();
    const original = f.workspace.getSnapshot().artifacts[0];
    await f.event('click', item);
    expect(f.document.querySelector('.ew-financial-library')).toBeNull();
    const artifacts = f.workspace.getSnapshot().artifacts;
    expect(artifacts).toHaveLength(2);
    expect(artifacts[1].id).not.toBe(original.id);
    expect(artifacts[1].containerSpec).toEqual(original.containerSpec);
    expect(f.generation.generate).not.toHaveBeenCalled();
    expect(artifacts[1].sourceNodeIds || []).toEqual([]);
    await f.render('second-board');
    await open(f);
    await f.event('click', f.document.querySelector('[data-custom-component]'));
    expect(f.registry.for('second-board').getSnapshot().artifacts).toHaveLength(1);
    expect(f.registry.for('second-board').getSnapshot().artifacts[0].containerSpec).toEqual(original.containerSpec);
});
it('右键重命名和删除仅影响库条目；点击外部和Escape关闭', async () => {
    const f = await fixture();
    await save(f);
    await open(f);
    let item = f.document.querySelector('[data-custom-component]');
    await f.event('contextmenu', item, { clientX: 220, clientY: 190 });
    expect(f.document.querySelector('[data-custom-library-menu]')).not.toBeNull();
    // The frosted menu establishes a containing block for fixed descendants.
    // A nested context menu both clips and expands its scrollable overflow.
    const library=f.document.querySelector('.ew-financial-library');library.style.backdropFilter='blur(24px)';
    expect(library.contains(f.document.querySelector('[data-custom-library-menu]'))).toBe(false);
    expect(f.document.querySelector('[data-custom-library-menu]').dataset.financialTheme).toBe('light');
    await f.event('pointerdown',f.document.querySelector('[data-custom-rename]'));
    expect(f.document.querySelector('.ew-financial-library')).toBe(library);
    await f.event('pointerdown', f.document.body);
    expect(f.document.querySelector('.ew-financial-library')).toBeNull();
    await open(f);
    item = f.document.querySelector('[data-custom-component]');
    await f.event('contextmenu', item, { clientX: 220, clientY: 190 });
    await f.event('click', f.document.querySelector('[data-custom-rename]'));
    const input = f.document.querySelector('[aria-label="组件名称"]');
    expect(input).not.toBeNull();
    await f.input(input, '自定义监控');
    await f.event('keydown', input, { key: 'Enter' });
    await vi.waitFor(() => expect(f.document.querySelector('[data-custom-component]').textContent).toContain('自定义监控'));
    expect(f.workspace.getSnapshot().artifacts[0].title).toBe('测试组件');
    item = f.document.querySelector('[data-custom-component]');
    await f.event('contextmenu', item, { clientX: 220, clientY: 190 });
    await f.event('keydown', f.document.body, { key: 'Escape' });
    expect(f.document.querySelector('[data-custom-library-menu]')).toBeNull();
    expect(f.document.querySelector('.ew-financial-library')).not.toBeNull();
    await f.event('contextmenu', item, { clientX: 220, clientY: 190 });
    await f.event('click', f.document.querySelector('[data-custom-remove]'));
    await vi.waitFor(() => expect(f.document.querySelector('[data-custom-component]')).toBeNull());
    expect(f.workspace.getSnapshot().artifacts).toHaveLength(1);
});
it('保存失败保留菜单可重试，完成的原生金融组件可保存到库', async () => {
    const f = await fixture();
    f.request.mockImplementationOnce(async () => { throw Error('磁盘不可用'); });
    await f.event('click', f.host.querySelector('[data-workbench-more]'));
    await f.event('click', f.document.querySelector('[data-workbench-save-library]'));
    expect(f.document.querySelector('[role=alert]').textContent).toContain('磁盘不可用');
    await f.event('keydown', f.document.body, { key: 'Escape' });
    await f.act(async () => f.workspace.createFinancialWidget('quote'));
    await f.event('click', f.host.querySelector('[data-financial-widget=quote]').closest('[data-research-node-id]').querySelector('[data-workbench-more]'));
    const native=f.workspace.getSnapshot().artifacts.find(node=>node.containerSpec?.type==='financial-widget');
    const save=f.document.querySelector('[data-workbench-save-library]');expect(save).not.toBeNull();await f.event('click',save);
    expect(f.request).toHaveBeenCalledWith({action:'save',sessionId:'financial-test',nodeId:native.id});expect(f.workspace.getSnapshot().artifacts).toHaveLength(2);
});
it('复用刷新配置重新绑定新节点，数据源暂不可用仍保留组件内容且关闭菜单', async () => {
    const f = await fixture();
    await save(f);
    const recipe = { templateId: 'table', templateVersion: '1', intervalMinutes: 1, enabled: false, requests: [{ key: 'q', toolId: 'public_data_query', args: {} }], mapping: {} };
    const previous = f.request.getMockImplementation();
    f.request.mockImplementation(async (a) => a.action === 'read' ? { node: f.template, recipe } : previous(a));
    const request = vi.fn(async () => ({ ok: true }));
    f.win.dshDesktop.componentData = { request };
    await open(f);
    await f.event('click', f.document.querySelector('[data-custom-component]'));
    const id = f.workspace.getSnapshot().artifacts[1].id;
    expect(request).toHaveBeenCalledWith('financial-test', { action: 'bind-generated', nodeId: id, recipe, initialSpec: f.template.containerSpec });
    expect(request).toHaveBeenCalledWith('financial-test', { action: 'configure', nodeId: id, settings: { enabled: false } });
    request.mockRejectedValueOnce(Error('所选数据工具未连接或当前工作区不可用'));
    await open(f);
    await f.event('click', f.document.querySelector('[data-custom-component]'));
    expect(f.workspace.getSnapshot().artifacts).toHaveLength(3);
    expect(f.workspace.getSnapshot().artifacts[2].containerSpec).toEqual(f.template.containerSpec);
    expect(f.document.querySelector('.ew-financial-library')).toBeNull();
    expect(f.document.querySelector('[role=alert]')).toBeNull();
});
it('自定义条目的更多按钮在加号左侧，菜单与右键相同且点击不会添加组件',async()=>{
    const f=await fixture();await save(f);await open(f);
    const more=f.document.querySelector('[data-custom-library-more]'),add=f.document.querySelector('[data-custom-library-add]');
    expect(more).not.toBeNull();expect(add).not.toBeNull();expect(more.nextElementSibling).toBe(add);
    await f.event('click',more);expect(f.document.querySelector('[data-custom-library-menu]').textContent).toBe('重命名删除');
    expect(f.workspace.getSnapshot().artifacts).toHaveLength(1);
    await f.event('click',f.document.querySelector('[data-custom-rename]'));expect(f.document.querySelector('[aria-label="组件名称"]')).not.toBeNull();
});
it('点击添加后立即关闭菜单，本地读取完成前不会卡住菜单',async()=>{
    const f=await fixture();await save(f);await open(f);let release;
    const previous=f.request.getMockImplementation();f.request.mockImplementation(a=>a.action==='read'?new Promise(resolve=>release=resolve):previous(a));
    await f.event('click',f.document.querySelector('[data-custom-component]'));
    expect(f.document.querySelector('.ew-financial-library')).toBeNull();
    await f.act(async()=>release({node:f.template}));
    await vi.waitFor(()=>expect(f.workspace.getSnapshot().artifacts).toHaveLength(2));
});
it('英文模式翻译自定义分类及右键操作，保存的名称保留原文', async () => {
    const f = await fixture();
    await save(f);
    f.document.documentElement.setAttribute('data-odyssey-locale', 'en');
    await open(f);
    const item = f.document.querySelector('[data-custom-component]');
    expect(item.textContent).toContain('测试组件');
    expect(f.document.querySelector('[data-custom-library]').textContent).toContain('Custom');
    await f.event('contextmenu', item, { clientX: 220, clientY: 190 });
    expect(f.document.querySelector('[data-custom-library-menu]').textContent).toBe('RenameDelete');
});
