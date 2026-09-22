import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { IntegrationView } from '../src/preload/integrations/view';
import type { IntegrationCommand, IntegrationReply, IntegrationSnapshot } from '../src/preload/integrations/bridge';

const fixtures: Array<{ view: IntegrationView; window: Window }> = [];
afterEach(async () => {
    for (const { view, window } of fixtures.splice(0)) {
        view.dispose();
        await window.happyDOM.close();
    }
    vi.useRealTimers();
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
    return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
function snapshot(): IntegrationSnapshot {
    return { revision: 4, rows: [
        { id: 'plugin-a', kind: 'plugin', tab: 'plugins', name: '插件 A', description: '', enabled: true, status: '已启用', source: '个人', revision: 1, removable: true },
        { id: 'plugin-b', kind: 'plugin', tab: 'plugins', name: '插件 B', description: '', enabled: true, status: '已启用', source: '个人', revision: 1, removable: true, canRollback: true },
        { id: 'skill', kind: 'skill', tab: 'skills', name: '已有技能', description: '', enabled: true, status: '已启用', source: '个人', revision: 1, removable: true },
        { id: 'api', kind: 'connection', tab: 'apps', name: '行情接口', description: '', enabled: true, status: '待测试', source: '个人', revision: 1, removable: true, configurable: true, connectionType: 'api', tools: [] },
    ] };
}
async function fixture(handler: (command: IntegrationCommand) => Promise<IntegrationReply>) {
    const window = new Window(), document = window.document as unknown as Document;
    document.body.innerHTML = '<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"><textarea>保留的对话草稿</textarea></main>';
    const calls: IntegrationCommand[] = [];
    const view = new IntegrationView(document, { request: async command => {
        calls.push(command);
        return command.type === 'snapshot' ? { type: 'snapshot', snapshot: snapshot() } : handler(command);
    } });
    fixtures.push({ view, window });
    await view.open();
    const button = (selector: string) => {
        const element = document.querySelector<HTMLButtonElement>(selector);
        expect(element, selector).not.toBeNull();
        return element!;
    };
    const click = (selector: string) => button(selector).click();
    return { window, document, view, calls, button, click };
}
const preview = (name: string): IntegrationReply => ({ type: 'preview', preview: { previewId: name, name, description: `${name} 的说明`, content: '# 技能正文', files: ['SKILL.md'], warnings: [] } });
const saved = (): IntegrationReply => ({ type: 'operation', operation: { id: 'saved', status: 'succeeded', message: '已保存', cancellable: false } });

it('serializes confirmation lookups across different rows and permits another confirmation after cancellation', async () => {
    const lookups = [deferred<IntegrationReply>(), deferred<IntegrationReply>()];
    let index = 0;
    const f = await fixture(async command => {
        if (command.type === 'dependencies') return lookups[index++]!.promise;
        throw new Error(`Unexpected ${command.type}`);
    });
    f.click('[data-more=plugin-a]'); f.click('[data-menu-action=uninstall]');
    expect(f.document.querySelector('.ig-live')!.textContent).toContain('正在检查');
    expect(f.document.querySelector('.ig-root')!.getAttribute('aria-busy')).toBe('true');
    f.click('[data-more=plugin-b]'); f.click('[data-menu-action=rollback]');
    expect(f.calls.filter(command => command.type === 'dependencies')).toHaveLength(1);
    expect(f.document.querySelector('[role=dialog]')).toBeNull();
    lookups[0]!.resolve({ type: 'dependencies', descriptions: ['任务 A 仍使用此插件'] });
    await settle();
    expect(f.document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    expect(f.document.querySelector('[role=dialog]')!.textContent).toContain('插件 A');
    expect(f.document.querySelector('[role=dialog]')!.textContent).toContain('任务 A');
    expect(f.document.activeElement).toBe(f.button('[data-action=cancel-dialog]'));
    f.click('[data-action=cancel-dialog]');
    expect(f.document.activeElement).toBe(f.button('[data-more=plugin-a]'));
    f.click('[data-more=plugin-b]'); f.click('[data-menu-action=rollback]');
    expect(f.calls.filter(command => command.type === 'dependencies')).toHaveLength(2);
    lookups[1]!.resolve({ type: 'dependencies', descriptions: [] });
    await settle();
    expect(f.document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    expect(f.document.querySelector('[role=dialog] h2')!.textContent).toContain('回退“插件 B”');
    expect(f.calls.some(command => command.type === 'uninstall' || command.type === 'rollback-plugin')).toBe(false);
});

it.each(['plugins','apps','mcp','skills'])('prevents overlapping skill selections from %s and keeps the preview when another picker is cancelled', async tab => {
    const selections = [deferred<IntegrationReply>(), deferred<IntegrationReply>(), deferred<IntegrationReply>()];
    let index = 0;
    const f = await fixture(async command => {
        if (command.type === 'preview-skill') return selections[index++]!.promise;
        throw new Error(`Unexpected ${command.type}`);
    });
    f.click(`[data-tab=${tab}]`); f.click('[data-action=add]'); f.click('[data-action=import-file]');
    expect(f.button('[data-action=choose-skill]').disabled).toBe(true);
    expect(f.button('[data-action=choose-skill]').getAttribute('aria-busy')).toBe('true');
    f.click('[data-action=choose-skill]');
    expect(f.calls.filter(command => command.type === 'preview-skill')).toHaveLength(1);
    selections[0]!.resolve(preview('技能 A'));
    await settle();
    expect(f.document.querySelector('.ig-skill-preview h2')!.textContent).toBe('技能 A');
    expect(f.button('[data-action=choose-skill]').disabled).toBe(false);
    expect(f.button('[data-action=choose-skill]').hasAttribute('aria-busy')).toBe(false);
    f.click('[data-action=choose-skill]');
    selections[1]!.resolve({ type: 'preview', preview: null });
    await settle();
    expect(f.document.querySelector('.ig-skill-preview h2')!.textContent).toBe('技能 A');
    expect(f.button('[data-action=choose-skill]').disabled).toBe(false);
    f.click('[data-action=choose-skill]');
    selections[2]!.resolve(preview('技能 B'));
    await settle();
    expect(f.calls.filter(command => command.type === 'preview-skill')).toHaveLength(3);
    expect(f.document.querySelector('.ig-skill-preview h2')!.textContent).toBe('技能 B');
    expect(f.calls.some(command => command.type === 'import-skill')).toBe(false);
});

it('releases mutation buttons when an operation poll fails after the user changes pages', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const poll = deferred<IntegrationReply>();
    const f = await fixture(async command => {
        if (command.type === 'operation') return poll.promise;
        if (command.type === 'set-enabled' && command.id === 'plugin-a') return { type: 'operation', operation: { id: 'pending-operation', status: 'running', message: '正在处理插件', cancellable: true } };
        if (command.type === 'set-enabled') return saved();
        throw new Error(`Unexpected ${command.type}`);
    });
    f.click('[data-toggle=plugin-a]');
    await settle();
    await vi.advanceTimersByTimeAsync(700);
    expect(f.calls.filter(command => command.type === 'operation')).toHaveLength(1);
    expect(f.document.querySelector('.ig-feedback')).toBeNull();
    expect(f.document.querySelector('.ig-actions [data-action=cancel-operation]')).not.toBeNull();
    f.click('[data-tab=skills]');
    expect(f.button('[data-toggle=skill]').disabled).toBe(true);
    poll.reject(new Error('旧页面的状态查询失败'));
    await settle();
    expect(f.button('[data-toggle=skill]').disabled).toBe(false);
    expect(f.document.querySelector('.ig-root')!.getAttribute('aria-busy')).toBe('false');
    expect(f.document.querySelector('.ig-error')!.textContent).not.toContain('旧页面');
    expect(f.document.querySelector('[data-action=cancel-operation]')).toBeNull();
    expect(f.document.querySelector('.ig-live')!.textContent).not.toContain('正在处理插件');
    f.click('[data-toggle=skill]');
    await settle();
    expect(f.calls.filter(command => command.type === 'set-enabled')).toHaveLength(2);
});

it('shows probe progress, prevents duplicate probes and restores retry controls after success or failure', async () => {
    const probes = [deferred<IntegrationReply>(), deferred<IntegrationReply>()];
    let index = 0;
    const f = await fixture(async command => {
        if (command.type === 'probe') return probes[index++]!.promise;
        throw new Error(`Unexpected ${command.type}`);
    });
    f.click('[data-tab=apps]'); f.click('[data-detail=api]'); f.click('[data-action=probe]');
    expect(f.document.querySelector('.ig-live')!.textContent).toContain('正在测试连接');
    expect(f.button('[data-action=probe]').disabled).toBe(true);
    expect(f.button('[data-action=probe]').getAttribute('aria-busy')).toBe('true');
    f.click('[data-action=probe]');
    expect(f.calls.filter(command => command.type === 'probe')).toHaveLength(1);
    probes[0]!.resolve({ type: 'probe', status: 'verified', message: '服务正常' });
    await settle();
    expect(f.document.querySelector('.ig-live')!.textContent).toContain('连接已验证：服务正常');
    expect(f.document.querySelector('.ig-feedback')).toBeNull();
    expect(f.document.querySelector('.ig-live')!.getAttribute('role')).toBe('status');
    expect(f.button('[data-action=probe]').disabled).toBe(false);
    expect(f.button('[data-action=probe]').hasAttribute('aria-busy')).toBe(false);
    f.click('[data-action=probe]');
    expect(f.calls.filter(command => command.type === 'probe')).toHaveLength(2);
    probes[1]!.reject(new Error('连接暂不可达'));
    await settle();
    expect(f.document.querySelector('[role=alert]')!.textContent).toContain('连接暂不可达');
    expect(f.document.querySelector('.ig-live')!.textContent).not.toContain('正在测试连接');
    expect(f.button('[data-action=probe]').disabled).toBe(false);
    expect(f.button('[data-action=probe]').hasAttribute('aria-busy')).toBe(false);
});
