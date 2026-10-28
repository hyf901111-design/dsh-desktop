import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { IntegrationView } from '../src/preload/integrations/view';
import type { IntegrationCommand, IntegrationReply, IntegrationSnapshot } from '../src/preload/integrations/bridge';

const fixtures: Array<{ view: IntegrationView; window: Window }> = [];
afterEach(async () => {
    vi.restoreAllMocks();
    for (const { view, window } of fixtures.splice(0)) {
        view.dispose();
        await window.happyDOM.close();
    }
});
async function settle() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
const snapshot = (): IntegrationSnapshot => ({ revision: 1, rows: [
    { id: 'plugin', kind: 'plugin', tab: 'plugins', name: '研究插件', description: '核验研究资料', enabled: true, status: '已启用', source: '个人', revision: 1, removable: true, marketEntryId: 'catalog:research', canRollback: true },
    { id: 'skill', kind: 'skill', tab: 'skills', name: '研究技能', description: '已有技能', enabled: true, status: '已启用', source: '个人', revision: 1, removable: true },
] });
async function fixture(data = snapshot()) {
    const window = new Window(), document = window.document as unknown as Document;
    document.body.innerHTML = '<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"><textarea>保留的对话草稿</textarea></main>';
    const calls: IntegrationCommand[] = [];
    const view = new IntegrationView(document, { request: async (command): Promise<IntegrationReply> => {
        calls.push(command);
        if (command.type === 'snapshot') return { type: 'snapshot', snapshot: data };
        if (command.type === 'preview-skill') return { type: 'preview', preview: { previewId: 'selected-skill', name: '待导入的完整技能包', description: '预览后确认', content: '# 技能正文', files: ['SKILL.md'], warnings: [] } };
        if (command.type === 'legacy-preview') return { type: 'legacy-preview', eligibleCount: 1, items: [{ name: '旧研究技能', kind: 'personal', status: 'eligible', sourcePath: '/example/skills/research' }] };
        throw new Error(`Unexpected command: ${command.type}`);
    } });
    fixtures.push({ view, window });
    await view.open();
    const element = <T extends Element = HTMLElement>(selector: string): T => {
        const target = document.querySelector<T>(selector);
        expect(target, selector).not.toBeNull();
        return target!;
    };
    const click = (selector: string) => element<HTMLButtonElement>(selector).click();
    const key = (value: string, shiftKey = false) => {
        const event = new window.KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true });
        document.activeElement!.dispatchEvent(event as unknown as Event);
        return event;
    };
    return { window, document, view, calls, element, click, key };
}

it('opens the shared add menu from skills and reaches file preview without importing automatically', async () => {
    const f = await fixture();
    f.click('[data-tab=skills]');
    expect(f.document.querySelector('.ig-compatibility')).toBeNull();
    expect(f.document.querySelector('[data-action=legacy-preview]')).toBeNull();
    const trigger = f.element<HTMLButtonElement>('.ig-heading [data-action=add]');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(f.element('[role=menu]').getAttribute('aria-label')).toBe('添加能力');
    expect(f.element('[role=menu]').textContent).toContain('导入技能');
    expect(f.element('[role=menu]').textContent).toContain('接入旧技能');
    expect(f.calls.map(command => command.type)).toEqual(['snapshot']);
    f.click('[data-action=import-file]');
    await settle();
    expect(f.document.querySelector('[role=menu]')).toBeNull();
    expect(f.element('.ig-skill-preview h2').textContent).toBe('待导入的完整技能包');
    expect(f.calls.filter(command => command.type === 'preview-skill')).toHaveLength(1);
    expect(f.calls.some(command => command.type === 'import-skill' || command.type === 'legacy-preview')).toBe(false);
});

it('opens the legacy review from the header menu and returns focus to that header after cancellation', async () => {
    const f = await fixture();
    f.click('[data-tab=skills]');
    const trigger = f.element<HTMLButtonElement>('.ig-heading [data-action=add]');
    trigger.click();
    f.click('[data-action=legacy-preview]');
    await settle();
    expect(f.document.querySelector('[role=menu]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(f.element('[role=dialog]').textContent).toContain('旧研究技能');
    expect(f.calls.filter(command => command.type === 'legacy-preview')).toHaveLength(1);
    expect(f.calls.some(command => command.type === 'preview-skill' || command.type === 'migrate-legacy-skills')).toBe(false);
    f.click('[data-action=cancel-dialog]');
    expect(f.document.querySelector('[role=dialog]')).toBeNull();
    expect(f.document.activeElement).toBe(trigger);
});

it.each(['scroll', 'resize', 'panel'] as const)('dismisses the menu when %s changes its anchor geometry', async kind => {
    const f = await fixture();
    const anchor = f.element<HTMLButtonElement>('[data-more=plugin]');
    anchor.click();
    expect(f.document.querySelector('[role=menu]')).not.toBeNull();
    if (kind === 'scroll') f.element('.ig-scroll').dispatchEvent(new f.window.Event('scroll') as unknown as Event);
    else if (kind === 'resize') f.window.dispatchEvent(new f.window.Event('resize'));
    else f.window.dispatchEvent(new f.window.CustomEvent('sherlock:workspace-panel-state', { detail: { surface: 'integrations', open: true } }));
    expect(f.document.querySelector('[role=menu]')).toBeNull();
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    anchor.click();
    expect(f.document.querySelectorAll('[role=menu]')).toHaveLength(1);
});

it.each([false, true])('closes the menu on Tab with shift=%s without cancelling native tab navigation', async shift => {
    const f = await fixture();
    const anchor = f.element<HTMLButtonElement>('[data-more=plugin]');
    anchor.click();
    const event = f.key('Tab', shift);
    expect(event.defaultPrevented).toBe(false);
    expect(f.document.querySelector('[role=menu]')).toBeNull();
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    // happy-dom does not implement native Tab traversal; the anchor is its starting point.
    expect(f.document.activeElement).toBe(anchor);
    expect(f.key('ArrowDown').defaultPrevented).toBe(false);
});

it('skips disabled menu items for arrow keys and retains Home, End and Escape focus behavior', async () => {
    const f = await fixture();
    const anchor = f.element<HTMLButtonElement>('[data-more=plugin]');
    anchor.click();
    const detail = f.element<HTMLButtonElement>('[data-menu-action=detail]');
    f.element<HTMLButtonElement>('[data-menu-action=toggle]').disabled = true;
    const update = f.element<HTMLButtonElement>('[data-menu-action=check-update]');
    const uninstall = f.element<HTMLButtonElement>('[data-menu-action=uninstall]');
    expect(f.document.activeElement).toBe(detail);
    expect(f.key('ArrowDown').defaultPrevented).toBe(true);
    expect(f.document.activeElement).toBe(update);
    f.key('ArrowUp'); expect(f.document.activeElement).toBe(detail);
    f.key('End'); expect(f.document.activeElement).toBe(uninstall);
    f.key('ArrowDown'); expect(f.document.activeElement).toBe(detail);
    f.key('Home'); expect(f.document.activeElement).toBe(detail);
    f.key('Escape');
    expect(f.document.querySelector('[role=menu]')).toBeNull();
    expect(f.document.activeElement).toBe(anchor);
});

function mockGeometry(f: Awaited<ReturnType<typeof fixture>>, anchorY: number, anchorX = 980) {
    Object.defineProperty(f.window, 'innerWidth', { configurable: true, value: 1100 });
    Object.defineProperty(f.window, 'innerHeight', { configurable: true, value: 800 });
    const original = f.window.HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(f.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: InstanceType<typeof f.window.HTMLElement>) {
        if (this.classList.contains('ig-root')) return new f.window.DOMRect(280, 10, 810, 780);
        if (this.classList.contains('ig-menu')) return new f.window.DOMRect(0, 0, 220, 190);
        if (this.hasAttribute('data-more')) return new f.window.DOMRect(anchorX, anchorY, 32, 32);
        return original.call(this);
    });
}

it('aligns the measured menu right edge to its trigger using viewport coordinates', async () => {
    const f = await fixture();
    mockGeometry(f, 200);
    f.click('[data-more=plugin]');
    const menu = f.element<HTMLElement>('[role=menu]');
    expect(Number.parseFloat(menu.style.left) + 220).toBe(1012);
    expect(Number.parseFloat(menu.style.top)).toBe(238);
});

it('flips above a bottom trigger and clamps a left-edge trigger within the panel', async () => {
    const f = await fixture();
    mockGeometry(f, 730, 286);
    f.click('[data-more=plugin]');
    const menu = f.element<HTMLElement>('[role=menu]');
    expect(Number.parseFloat(menu.style.top)).toBe(534);
    expect(Number.parseFloat(menu.style.top) + 190).toBeLessThan(730);
    expect(Number.parseFloat(menu.style.left)).toBe(288);
});

const integrationTabs = ['plugins', 'apps', 'mcp', 'skills'] as const;
const addItems = [
    { text: '创建插件', selector: '[data-add=plugin]', title: '创建插件', field: '[name=manifest]' },
    { text: '添加市场来源', selector: '[data-action=add-source]', title: '添加目录来源', field: '[name=sourceUrl]' },
    { text: '自定义 API', selector: '[data-add=api]', title: '添加自定义 API', field: '[name=url]' },
    { text: '添加 MCP 服务器', selector: '[data-add=mcp-http]', title: '添加 MCP 服务器', field: '[data-action=form-transport-mcp-http]' },
    { text: '导入技能', selector: '[data-action=import-file]', title: '导入技能', field: '.ig-skill-preview' },
    { text: '接入旧技能', selector: '[data-action=legacy-preview]', title: '', field: '[role=dialog]' },
] as const;
function expectSharedAddMenu(f: Awaited<ReturnType<typeof fixture>>) {
    const menu = f.element('[role=menu]');
    expect(menu.getAttribute('aria-label')).toBe('添加能力');
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    expect(items.map(item => item.textContent?.trim())).toEqual(addItems.map(item => item.text));
    for (const [index, item] of addItems.entries()) expect(items[index]!.matches(item.selector), item.text).toBe(true);
    expect(menu.querySelectorAll('[role=separator]')).toHaveLength(1);
    expect(menu.querySelector('[role=separator]')!.previousElementSibling).toBe(items[3]);
}

it.each(integrationTabs)('uses the identical add menu from %s and returns to that tab from every destination', async tab => {
    const f = await fixture();
    f.click(`[data-tab=${tab}]`);
    for (const item of addItems) {
        const trigger = f.element<HTMLButtonElement>('.ig-heading [data-action=add]');
        expect(trigger.textContent?.trim()).toBe('添加');
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
        trigger.click();
        expectSharedAddMenu(f);
        expect(f.element(`[data-tab=${tab}]`).getAttribute('aria-selected')).toBe('true');
        expect(f.document.querySelector('.ig-add-row')).toBeNull();
        f.click(item.selector);await settle();
        expect(f.document.querySelector('[role=menu]')).toBeNull();
        expect(f.document.querySelector(item.field), item.text).not.toBeNull();
        if (item.title) {
            expect(f.element('h1').textContent).toBe(item.title);
            expect(f.document.querySelector('.ig-heading [data-action=add]')).toBeNull();
            expect(f.document.querySelectorAll('.ig-page [data-add], .ig-page [data-action=import-file], .ig-page [data-action=legacy-preview]')).toHaveLength(0);
            const formMarkers = ['[name=manifest]','[name=sourceUrl]','.ig-steps','.ig-transport','.ig-skill-select'];
            expect(formMarkers.filter(selector => f.document.querySelector(selector))).toHaveLength(1);
            f.click('.workspace-back-button');
        } else f.click('[data-action=cancel-dialog]');
        expect(f.element(`[data-tab=${tab}]`).getAttribute('aria-selected')).toBe('true');
        expect(f.document.querySelector('[role=dialog]')).toBeNull();
    }
    expect(f.calls.map(command => command.type)).toEqual(['snapshot','preview-skill','legacy-preview']);
});

it.each(integrationTabs)('opens the same menu from the %s empty-state add button without opening an intermediate page', async tab => {
    const f = await fixture({ revision: 1, rows: [] });
    f.click(`[data-tab=${tab}]`);
    f.click('.ig-empty [data-action=add]');
    expectSharedAddMenu(f);
    expect(f.element(`[data-tab=${tab}]`).getAttribute('aria-selected')).toBe('true');
    expect(f.document.querySelector('.ig-add-row')).toBeNull();
    expect(f.calls.map(command => command.type)).toEqual(['snapshot']);
});
