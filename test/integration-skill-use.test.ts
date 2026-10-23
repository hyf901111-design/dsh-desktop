import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createSkillUseBridge } from '../src/preload/integrations/skill-use';
import type { IntegrationBridge, SkillDetail } from '../src/shared/integration-ui';

const windows: Window[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.happyDOM.abort()); });
const detail: SkillDetail = { type: 'skill-detail', id: 'skill-1', revision: 2, enabled: true, invocationName: 'ework-skill-1234567890abcdef', content: '# Real skill' };
const input = { id: 'skill-1', revision: 2, invocationName: 'stale-ui-name', name: '显示名称' };
function fixture(request: IntegrationBridge['request'] = async () => detail, afterReply?: (phase: string) => void) {
    const w = new Window(); windows.push(w);
    const phases: Array<{ phase: string; invocationName?: string }> = [];
    w.addEventListener('sherlock:skill-compose-request', event => {
        const payload = (event as unknown as CustomEvent).detail;
        phases.push(payload);
        w.dispatchEvent(new w.CustomEvent('sherlock:skill-compose-reply', { detail: { requestId: payload.requestId, ok: true, token: 'draft-ticket' } }));
        afterReply?.(payload.phase);
    });
    const reveal = vi.fn();
    const adapter = createSkillUseBridge(w.document as unknown as Document, { request }, reveal);
    return { adapter, phases, reveal };
}
it('rereads current authority and inserts only the verified invocation name before revealing and focusing', async () => {
    const request = vi.fn(async () => detail);
    const f = fixture(request);
    await f.adapter.useSkill(input);
    expect(request).toHaveBeenCalledExactlyOnceWith({ type: 'skill-detail', id: input.id, revision: input.revision });
    expect(f.phases.map(p => p.phase)).toEqual(['prepare', 'insert', 'focus', 'cancel']);
    expect(f.phases[1]?.invocationName).toBe(detail.invocationName);
    expect(f.reveal).toHaveBeenCalledTimes(1);
    f.adapter.dispose();
});
it.each([0, 7])('forwards the navigation-time expectedDraftRev to native prepare (%s)', async expectedDraftRev => {
    const f = fixture(), operation = { ...input, expectedDraftRev };
    await f.adapter.useSkill(operation);
    expect(f.phases[0]).toMatchObject({ phase: 'prepare', expectedDraftRev });
    f.adapter.dispose();
});
it('forwards prefill together with a freshly verified readable native skill reference', async () => {
    const fresh = { ...detail, invocationLabel: 'efund-ppt-maker' };
    const f = fixture(async () => fresh);
    const text = '请按公司风格制作PPT。\n主题：';
    const prefill = { text, selectionStart: text.length, selectionEnd: text.length };
    await f.adapter.useSkill({ ...input, prefill });
    expect(f.phases[1]).toMatchObject({ phase: 'insert', prefill, reference: { id: fresh.id, revision: fresh.revision, invocationName: fresh.invocationName, label: fresh.invocationLabel } });
    expect(f.reveal).toHaveBeenCalledOnce();
    f.adapter.dispose();
});
it.each([undefined, ''])('rejects prefill without a fresh native reference label (%j) before insertion', async invocationLabel => {
    const f = fixture(async () => ({ ...detail, invocationLabel }));
    const operation = { ...input, prefill: { text: '主题：', selectionStart: 3, selectionEnd: 3 } };
    await expect(f.adapter.useSkill(operation)).rejects.toThrow();
    expect(f.phases.map(p => p.phase)).toEqual(['prepare', 'cancel']);
    expect(f.reveal).not.toHaveBeenCalled();
    f.adapter.dispose();
});
it('does not close a newly opened page if navigation happens just after insertion acknowledgement', async () => {
    const signal = new AbortController();
    const f = fixture(async () => detail, phase => { if (phase === 'insert') signal.abort(); });
    await f.adapter.useSkill({ ...input, signal: signal.signal });
    expect(f.reveal).not.toHaveBeenCalled();
    expect(f.phases.some(p => p.phase === 'focus')).toBe(false);
    f.adapter.dispose();
});
it.each([
    { ...detail, enabled: false, unavailableReason: '技能已停用' },
    { ...detail, usable: false as const, unavailableReason: '所属插件已停用' },
    { ...detail, revision: 3 },
])('does not touch the composer when authority changed (%j)', async reply => {
    const f = fixture(async () => reply);
    await expect(f.adapter.useSkill(input)).rejects.toThrow();
    expect(f.phases.map(p => p.phase)).toEqual(['prepare', 'cancel']);
    expect(f.reveal).not.toHaveBeenCalled();
    f.adapter.dispose();
});
it.each(['identity', 'navigation'] as const)('discards a pending detail result after %s changes', async reason => {
    let resolve!: (value: SkillDetail) => void;
    const f = fixture(() => new Promise<SkillDetail>(done => { resolve = done; }));
    const signal = new AbortController();
    const operation = f.adapter.useSkill({ ...input, signal: signal.signal });
    const rejected = expect(operation).rejects.toThrow('变化');
    await Promise.resolve();
    if (reason === 'identity') f.adapter.reset(); else signal.abort();
    resolve(detail);
    await rejected;
    expect(f.phases.some(p => p.phase === 'insert')).toBe(false);
    expect(f.reveal).not.toHaveBeenCalled();
    f.adapter.dispose();
});
