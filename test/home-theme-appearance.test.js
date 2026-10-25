import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let patch, install, toggle, nativeSource;
const clean = [];
beforeAll(async () => { nativeSource = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js', 'utf8'); const mod = await import('../scripts/lib/home-theme-appearance.mjs').catch(() => ({})); patch = mod.patchHomeThemeAppearance; install = mod.installHomeThemeAppearance; toggle = (await import('../src/preload/home-theme-controls').catch(() => ({}))).toggleHomeAppearance; });
afterEach(async () => { vi.useRealTimers(); for (const fn of clean.splice(0).reverse())
    await fn(); });
function fixture() { const win = new Window({ url: 'https://theme.test/' }); clean.push(() => win.happyDOM.close()); const dir = mkdtempSync(join(tmpdir(), 'native-appearance-')); clean.push(() => rmSync(dir, { recursive: true, force: true })); const file = join(dir, 'settings.json'); writeFileSync(file, JSON.stringify({ preference: 'system' })); const listeners = new Set(), effects = [], events = []; const ctx = { effect: fn => { const dispose = fn(); if (typeof dispose === 'function')
        effects.push(dispose); }, emit: (name, value) => events.push({ name, value }) }; const host = { getSnapshot: () => ({ value: JSON.parse(readFileSync(file, 'utf8')) }), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, set: (key, value) => { const data = JSON.parse(readFileSync(file, 'utf8')); data[key] = value; writeFileSync(file, JSON.stringify(data)); for (const fn of listeners)
        fn(); } }; const begin = nativeSource.indexOf('var ThemeRuntime = class'), end = nativeSource.indexOf('\n\t\t/**\n\t\t* Runtime shape check', begin); const ThemeRuntime = new Function('BUILTIN_THEMES', 'DEFAULT_PREFERENCE', 'isThemePreference', 'THEME_PREFERENCE_FIELD', 'matchMedia', nativeSource.slice(begin, end) + ';return ThemeRuntime')([{ id: 'light', colorScheme: 'light', tokens: {} }, { id: 'dark', colorScheme: 'dark', tokens: {} }], 'system', value => ['light', 'dark', 'system'].includes(value), 'preference', () => ({ matches: false, addEventListener() { }, removeEventListener() { } })); const runtime = new ThemeRuntime(ctx, host); clean.push(() => effects.forEach(fn => fn())); return { win, doc: win.document, runtime, events, file, host, remount: () => new ThemeRuntime(ctx, host) }; }
it('patches exactly the real native service once and rejects drift or duplicate installations', () => { expect(patch).toBeTypeOf('function'); const result = patch(nativeSource); expect(patch(result)).toBe(result); expect(result).toContain('ctx.effect(() => installHomeThemeAppearance(theme)'); expect(() => patch(nativeSource.replace('ctx.provide("theme", theme);', 'ctx.provide("themeV2", theme);'))).toThrow(); expect(() => patch(result.replace('installHomeThemeAppearance(theme)', 'installHomeThemeAppearance(other)'))).toThrow(); });
it('crosses a JSON-only request/reply boundary into the real ThemeRuntime and restores the persisted global preference', async () => { expect(install).toBeTypeOf('function'); expect(toggle).toBeTypeOf('function'); const f = fixture(), requests = []; const off = install(f.runtime, f.doc); clean.push(off); f.doc.addEventListener('sherlock:home-appearance-request', event => requests.push(JSON.parse(JSON.stringify(event.detail)))); await toggle(f.doc); expect(requests).toHaveLength(1); expect(Object.keys(requests[0]).sort()).toEqual(['action', 'requestId']); expect(f.runtime.getTheme().active.colorScheme).toBe('dark'); expect(JSON.parse(readFileSync(f.file, 'utf8')).preference).toBe('dark'); expect(f.doc.body.hasAttribute('data-ds-dark-theme')).toBe(false); expect(f.events.some(e => e.name === 'theme/change' && e.value.active.colorScheme === 'dark')).toBe(true); expect(f.remount().getTheme().active.colorScheme).toBe('dark'); const original = f.runtime; await toggle(f.doc); expect(f.runtime).toBe(original); expect(f.runtime.getTheme().active.colorScheme).toBe('light'); });
it('rejects native failures and unavailable bridges without changing DOM mode, and removes late listeners', async () => { expect(install).toBeTypeOf('function'); expect(toggle).toBeTypeOf('function'); const f = fixture(); const off = install({ getTheme: () => f.runtime.getTheme(), setTheme: () => { throw Error('settings write failed'); } }, f.doc); await expect(toggle(f.doc)).rejects.toThrow('settings write failed'); expect(f.doc.body.hasAttribute('data-ds-dark-theme')).toBe(false); off(); vi.useFakeTimers(); f.win.setTimeout = globalThis.setTimeout; f.win.clearTimeout = globalThis.clearTimeout; const promise = toggle(f.doc); const check = expect(promise).rejects.toThrow(/unavailable|超时/); await vi.advanceTimersByTimeAsync(6000); await check; expect(f.runtime.getTheme().active.colorScheme).toBe('light'); });
it('single-flights concurrent toggles and ignores unmatched replies and extra request fields', async () => { expect(install).toBeTypeOf('function'); expect(toggle).toBeTypeOf('function'); const f = fixture(); const off = install(f.runtime, f.doc); clean.push(off); f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:home-appearance-request', { detail: { requestId: 'wrong', action: 'toggle', mode: 'dark' } })); expect(f.runtime.getTheme().active.colorScheme).toBe('light'); const first = toggle(f.doc), second = toggle(f.doc); expect(second).toBe(first); await first; expect(f.runtime.getTheme().active.colorScheme).toBe('dark'); });
it('executes the patched native plugin apply lifecycle using its actual service and settings namespace', async () => {
    const f = fixture(), provided = new Map(), bound = [], scoped = [];
    const ctx = { effect: fn => { const off = fn(); if (typeof off === 'function') {
            clean.push(off);
            scoped.push(off);
        } }, emit: (name, value) => f.events.push({ name, value }), provide: (name, value) => provided.set(name, value), settingsScope: { bind: value => { bound.push(value); return f.host; } }, locale: { register: () => () => { } }, on: () => () => { }, slots: { inject: () => () => { } } };
    const source = patch(nativeSource), start = source.indexOf('function apply(ctx)'), end = source.indexOf('\n\t\t//#endregion', start), namespace = JSON.parse(nativeSource.match(/const THEME_SETTINGS_NAMESPACE = ("[^"]+")/)[1]);
    const apply = new Function('ThemeRuntime', 'THEME_SETTINGS_NAMESPACE', 'SETTINGS_NS', 'zh', 'en', 'createAppearanceRowStore', 'document', source.slice(start, end) + ';return apply')(f.runtime.constructor, namespace, 'ui-theme', {}, {}, () => ({}), f.doc);
    apply(ctx);
    expect(bound).toEqual([{ namespace }]);
    expect(provided.get('theme')).toBeInstanceOf(f.runtime.constructor);
    await toggle(f.doc);
    expect(provided.get('theme').getTheme().active.colorScheme).toBe('dark');
    expect(JSON.parse(readFileSync(f.file, 'utf8')).preference).toBe('dark');
    for (const dispose of scoped.reverse())
        dispose();
    f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:home-appearance-request', { detail: { requestId: 'after-dispose', action: 'toggle' } }));
    expect(provided.get('theme').getTheme().active.colorScheme).toBe('dark');
});
it('ignores unmatched responses, cancels on page departure and never accepts a late acknowledgement', async () => {
    const f = fixture(), requests = [];
    f.doc.addEventListener('sherlock:home-appearance-request', event => requests.push(event.detail));
    let settled = false;
    const promise = toggle(f.doc);
    promise.then(() => { settled = true; }, () => { settled = true; });
    f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:home-appearance-reply', { detail: { requestId: 'different', ok: true } }));
    await Promise.resolve();
    expect(settled).toBe(false);
    const check = expect(promise).rejects.toThrow(/cancelled/);
    f.win.dispatchEvent(new f.win.Event('pagehide'));
    await check;
    f.doc.dispatchEvent(new f.win.CustomEvent('sherlock:home-appearance-reply', { detail: { requestId: requests[0].requestId, ok: true } }));
    expect(f.runtime.getTheme().active.colorScheme).toBe('light');
});
