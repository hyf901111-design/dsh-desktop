import { Window } from 'happy-dom'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mountHomeThemes, getHomeThemeController } from '../src/preload/home-themes'
import type { HomeTheme } from '../src/shared/home-themes'
import { HomeThemePreferenceStore } from '../src/main/home-theme-preferences'
import koiLight from '../src/preload/home-theme-assets/koi-pond-light.png?inline'
import koiDark from '../src/preload/home-theme-assets/koi-pond-dark.png?inline'

const STORAGE_KEY = 'ework.home-background.v1'
const THEME_IDS = ['default', 'berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'haseeb', 'kirian', 'splines', 'antiquue', 'crt-warp', 'dither', 'koi-pond']
const fixtures: Array<{ dispose(): void; win: Window }> = []
const userDataDirectories: string[] = []

function fixture({ reducedMotion = false, initial = undefined as string | undefined, storageBlocked = false, url = 'https://odyssey.test/' } = {}) {
  const win = new Window({ url })
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  const animations: unknown[] = []
  win.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }) as unknown as typeof win.requestAnimationFrame
  win.cancelAnimationFrame = ((id: number) => { frames.delete(id) }) as unknown as typeof win.cancelAnimationFrame
  const media = win.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { configurable: true, value: reducedMotion })
  win.matchMedia = (() => media) as typeof win.matchMedia
  // Business behavior must remain usable when WebGL is unavailable, as on a
  // disabled GPU. The fallback canvas still receives a normal 2D surface.
  win.HTMLCanvasElement.prototype.getContext = ((kind: string) => kind === '2d' ? {
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  } : null) as unknown as typeof win.HTMLCanvasElement.prototype.getContext
  ;(win.HTMLElement.prototype as unknown as HTMLElement).animate = ((...args: unknown[]) => {
    animations.push(args)
    return { cancel() {}, finished: Promise.resolve(), addEventListener() {} }
  }) as unknown as typeof HTMLElement.prototype.animate
  if (initial !== undefined) win.localStorage.setItem(STORAGE_KEY, initial)
  if (storageBlocked) Object.defineProperty(win, 'localStorage', { configurable: true, get() { throw new Error('Storage disabled') } })
  win.document.body.innerHTML = `
    <main class="pI_x6G_centerCol">
      <section class="wSkVaW_root" data-odyssey-page="home"><textarea aria-label="发送消息"></textarea></section>
    </main>
    <aside data-odyssey-subagent-panel>
      <section class="wSkVaW_root" data-odyssey-page="home"></section>
    </aside>`
  const doc = win.document as unknown as Document
  for (const element of doc.querySelectorAll<HTMLElement>('.pI_x6G_centerCol, .pI_x6G_centerCol .wSkVaW_root')) {
    Object.defineProperties(element, {
      clientWidth: { configurable: true, value: 960 },
      clientHeight: { configurable: true, value: 720 },
      getBoundingClientRect: { configurable: true, value: () => ({ x: 0, y: 0, top: 0, right: 960, bottom: 720, left: 0, width: 960, height: 720 }) }
    })
  }
  let dispose: (() => void) | undefined
  const result = {
    win, doc, frames, animations,
    mount(preferences?: { get(): unknown; set(theme: string): boolean }) { return (dispose = mountHomeThemes(doc, preferences)) },
    dispose() { dispose?.() },
    async settle() {
      await Promise.resolve()
      await new Promise(resolve => setTimeout(resolve, 0))
      await Promise.resolve()
    },
    step(time = 100) {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(time))
    },
    surface(value?: string) {
      if (value === undefined) win.document.body.removeAttribute('data-workspace-surface')
      else win.document.body.setAttribute('data-workspace-surface', value)
      win.document.dispatchEvent(new win.CustomEvent('sherlock:workspace-surface-change', { bubbles: true }))
    },
    dock() { return doc.querySelector<HTMLElement>('[data-odyssey-theme-dock]') },
    background() { return doc.querySelector<HTMLElement>('[data-odyssey-home-theme-background]') },
    current() { return getHomeThemeController(doc)?.getSelected() },
    click(position: string) {
      const control = getHomeThemeController(doc)!, index = THEME_IDS.indexOf(control.getSelected())
      control.select(THEME_IDS[position === 'next' ? (index + 1) % THEME_IDS.length : position === 'previous' ? (index + THEME_IDS.length - 1) % THEME_IDS.length : index] as HomeTheme)
    }

  }
  fixtures.push(result)
  return result
}

function visible(element: HTMLElement | null) {
  if (!element?.isConnected) return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView!.getComputedStyle(node)
    if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}

afterEach(async () => {
  for (const entry of fixtures.splice(0)) {
    entry.dispose()
    await entry.win.happyDOM.close()
  }
  for (const directory of userDataDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('home background theme controller', () => {
    it('migrates the legacy choice and restores native changes after a new client origin', () => {
        const path = mkdtempSync(join(tmpdir(), 'ework-home-theme-restart-'));
        userDataDirectories.push(path);
        const first = fixture({ initial: 'jarrick', url: 'http://127.0.0.1:49195/' });
        first.mount(new HomeThemePreferenceStore(path));
        expect(new HomeThemePreferenceStore(path).get()).toBe('jarrick');
        first.click('next');
        expect(first.current()).toBe('lowfreez');
        first.dispose();
        const next = fixture({ url: 'http://127.0.0.1:53584/' });
        next.mount(new HomeThemePreferenceStore(path));
        expect(next.current()).toBe('lowfreez');
    });
    it('prefers the durable choice and handles blocked local storage', () => {
        const prefs = { get: () => 'jarrick', set: () => true }, f = fixture({ initial: 'default' });
        f.mount(prefs);
        expect(f.current()).toBe('jarrick');
        const blocked = fixture({ storageBlocked: true });
        blocked.mount(prefs);
        expect(blocked.current()).toBe('jarrick');
        blocked.click('next');
        expect(blocked.current()).toBe('lowfreez');
    });
    it.each(['false', 'throw'])('preserves failed native writes (%s) and retries after remount', failure => {
        let saved = 'jarrick', writable = false;
        const prefs = { get: () => saved, set: (theme: string) => { if (!writable) {
                if (failure === 'throw')
                    throw Error('disk unavailable');
                return false;
            } saved = theme; return true; } };
        const f = fixture();
        f.mount(prefs);
        f.click('next');
        expect(f.current()).toBe('lowfreez');
        f.dispose();
        f.mount(prefs);
        expect(f.current()).toBe('lowfreez');
        expect(f.win.localStorage.getItem(STORAGE_KEY)).toBe('lowfreez');
        writable = true;
        f.dispose();
        f.mount(prefs);
        expect(saved).toBe('lowfreez');
    });
    it('does not overwrite a newer native choice with an older failed write', () => {
        let saved = 'jarrick', writable = false;
        const prefs = { get: () => saved, set: (value: string) => { if (!writable)
                return false; saved = value; return true; } };
        const f = fixture();
        f.mount(prefs);
        f.click('next');
        f.dispose();
        saved = 'boz';
        writable = true;
        f.mount(prefs);
        expect(f.current()).toBe('boz');
        expect(saved).toBe('boz');
    });
    it.each(['emreturan', 'abramovdesign', 'pattern-waves', 'gradient-ascii', 'faulty-terminal', 'liquid-chrome'])('migrates removed %s to default without changing the 15 native choices', initial => {
        const f = fixture({ initial });
        f.mount();
        expect(f.current()).toBe('default');
        expect(f.win.localStorage.getItem(STORAGE_KEY)).toBe('default');
        for (const id of THEME_IDS) {
            getHomeThemeController(f.doc)!.select(id as HomeTheme);
            expect(f.current()).toBe(id);
        }
    });
    it.each(['lotustech', 'not-a-theme', '{"id":"berber"}', '<img src=x onerror=alert(1)>'])('ignores unknown stored preference %s', initial => {
        const f = fixture({ initial });
        f.mount();
        expect(f.current()).toBe('default');
        expect(f.doc.querySelector('img')).toBeNull();
        getHomeThemeController(f.doc)!.select(initial as HomeTheme);
        expect(f.current()).toBe('default');
    });
    it('shares exactly one background owner and never creates the old dock', () => {
        const f = fixture(), dispose = f.mount();
        expect(mountHomeThemes(f.doc)).toBe(dispose);
        expect(f.dock()).toBeNull();
        expect(f.doc.querySelectorAll('[data-odyssey-home-theme-background]')).toHaveLength(1);
        expect(f.background()!.closest('.pI_x6G_centerCol')).not.toBeNull();
        expect(f.doc.querySelector('[data-odyssey-subagent-panel] canvas')).toBeNull();
        expect(f.doc.querySelector('textarea')!.getAttribute('aria-label')).toBe('发送消息');
    });
    it('waits for the main home without attaching to a subagent home', async () => {
        const f = fixture(), main = f.doc.querySelector('.pI_x6G_centerCol')!, home = main.firstElementChild!;
        home.remove();
        f.mount();
        expect(f.background()).toBeNull();
        expect(f.frames.size).toBe(0);
        main.append(home);
        await f.settle();
        expect(visible(f.background())).toBe(true);
        expect(f.dock()).toBeNull();
    });
    it('uses the actual mode-specific Koi thumbnail without resetting its selection', async () => {
        const f = fixture({ initial: 'koi-pond' });
        f.mount();
        const c = getHomeThemeController(f.doc)!;
        expect(c.getThumbnail('koi-pond')).toBe(koiLight);
        expect(f.background()!.dataset.homeThemeFamily).toBe('koi');
        f.doc.body.setAttribute('data-ds-dark-theme', 'true');
        await f.settle();
        expect(c.getThumbnail('koi-pond')).toBe(koiDark);
        expect(c.getSelected()).toBe('koi-pond');
        expect(f.frames.size).toBe(1);
    });
    it('switches every native key without changing the global application mode', async () => {
        const f = fixture();
        f.doc.body.setAttribute('data-ds-dark-theme', 'true');
        f.mount();
        for (const id of THEME_IDS) {
            getHomeThemeController(f.doc)!.select(id as HomeTheme);
            await f.settle();
            expect(f.current()).toBe(id);
            expect(f.background()!.dataset.homeThemeId).toBe(id);
            expect(f.doc.body.getAttribute('data-ds-dark-theme')).toBe('true');
        }
        const blocked = fixture({ storageBlocked: true });
        blocked.mount();
        blocked.click('next');
        expect(blocked.current()).toBe('berber');
    });
    it('hides and pauses behind workspaces, conversations, settings and detached homes', async () => {
        const f = fixture();
        f.mount();
        expect(f.background()!.dataset.renderState).toBe('running');
        for (const surface of ['notes', 'integrations']) {
            f.surface(surface);
            await f.settle();
            expect(visible(f.background())).toBe(false);
            expect(f.frames.size).toBe(0);
            f.surface();
            await f.settle();
            expect(visible(f.background())).toBe(true);
            expect(f.frames.size).toBe(1);
        }
        const home = f.doc.querySelector<HTMLElement>('.pI_x6G_centerCol [data-odyssey-page]')!;
        home.dataset.odysseyPage = 'conversation';
        await f.settle();
        expect(visible(f.background())).toBe(false);
        expect(f.frames.size).toBe(0);
        home.dataset.odysseyPage = 'home';
        await f.settle();
        const settings = f.doc.createElement('div');
        settings.className = 'VOzbGW_overlay';
        f.doc.body.append(settings);
        await f.settle();
        expect(visible(f.background())).toBe(false);
        settings.hidden = true;
        await f.settle();
        expect(visible(f.background())).toBe(true);
        home.remove();
        await f.settle();
        expect(visible(f.background())).toBe(false);
        expect(f.frames.size).toBe(0);
    });
    it('retains selection and rendering with reduced motion without starting frame loops', async () => {
        const f = fixture({ reducedMotion: true });
        f.mount();
        expect(f.frames.size).toBe(0);
        expect(f.animations).toHaveLength(0);
        expect(f.background()!.dataset.renderState).toBe('paused');
        f.click('next');
        await f.settle();
        expect(f.current()).toBe('berber');
        f.surface('notes');
        await f.settle();
        f.surface();
        await f.settle();
        expect(visible(f.background())).toBe(true);
        expect(f.frames.size).toBe(0);
        expect(f.animations).toHaveLength(0);
    });
    it('releases every surface, ignores late events and permits a clean remount', async () => {
        const f = fixture(), original = f.doc.body.innerHTML, dispose = f.mount();
        dispose();
        dispose();
        expect(f.background()).toBeNull();
        expect(f.doc.querySelector('canvas')).toBeNull();
        expect(f.frames.size).toBe(0);
        expect(getHomeThemeController(f.doc)).toBeUndefined();
        f.surface('notes');
        f.surface();
        await f.settle();
        expect(f.frames.size).toBe(0);
        expect(f.doc.body.innerHTML).toBe(original);
        expect(f.mount()).not.toBe(dispose);
        expect(f.dock()).toBeNull();
        expect(f.doc.querySelectorAll('[data-odyssey-home-theme-background]')).toHaveLength(1);
    });
});
