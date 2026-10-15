import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { mountHomeThemes } from '../src/preload/home-themes'

const STORAGE_KEY = 'ework.home-background.v1'
const THEME_IDS = ['default', 'berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'lotustech']
const fixtures: Array<{ dispose(): void; win: Window }> = []

function fixture({ reducedMotion = false, initial = undefined as string | undefined, storageBlocked = false } = {}) {
  const win = new Window({ url: 'https://odyssey.test/' })
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
    mount() { return (dispose = mountHomeThemes(doc)) },
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
    cards() { return [...doc.querySelectorAll<HTMLButtonElement>('[data-odyssey-theme-dock] button[data-home-theme-id]')] },
    current() { return doc.querySelector<HTMLButtonElement>('[data-odyssey-theme-dock] [aria-pressed="true"][data-home-theme-id]') },
    click(position: string) {
      const card = doc.querySelector<HTMLButtonElement>(`[data-odyssey-theme-dock] [data-home-theme-position="${position}"]`)
      expect(card, `The ${position} card should be available`).not.toBeNull()
      card!.click()
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
})

describe('home background theme controller', () => {
  it('mounts one accessible dock only in the actual main home, and repeated mounting is idempotent', () => {
    const f = fixture()
    const dispose = f.mount()
    expect(mountHomeThemes(f.doc)).toBe(dispose)
    expect(f.doc.querySelectorAll('[data-odyssey-theme-dock]')).toHaveLength(1)
    expect(f.dock()!.closest('.pI_x6G_centerCol')).not.toBeNull()
    expect(f.doc.querySelector('[data-odyssey-subagent-panel] [data-odyssey-theme-dock]')).toBeNull()
    expect(f.dock()!.getAttribute('role')).toBe('group')
    expect(f.dock()!.getAttribute('aria-label')).toBe('首页背景主题')
    expect(f.background()!.closest('.pI_x6G_centerCol')).not.toBeNull()
    expect(f.cards().map(card => card.dataset.homeThemeId)).toEqual(THEME_IDS)
    expect(f.current()!.dataset.homeThemeId).toBe('default')
    expect(f.doc.querySelector('textarea')!.getAttribute('aria-label')).toBe('发送消息')
  })

  it('waits for the actual home to arrive after preload initialization, without mounting on a subagent home', async () => {
    const f = fixture()
    const main = f.doc.querySelector('.pI_x6G_centerCol')!
    const home = main.firstElementChild!
    home.remove()
    f.mount()
    expect(f.dock()).toBeNull()
    expect(f.background()).toBeNull()
    expect(f.frames.size).toBe(0)
    main.append(home)
    await f.settle()
    expect(visible(f.dock())).toBe(true)
    expect(visible(f.background())).toBe(true)
    expect(f.doc.querySelectorAll('[data-odyssey-theme-dock]')).toHaveLength(1)
  })

  it('keeps three visible positions, skips hidden cards in keyboard navigation, and cycles in both directions', async () => {
    const f = fixture()
    f.mount()
    const originalCards = f.cards()
    const check = (id: string) => {
      expect(f.cards()).toEqual(originalCards)
      expect(f.cards().filter(card => card.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
      expect(f.current()!.dataset.homeThemeId).toBe(id)
      expect(f.current()!.dataset.homeThemePosition).toBe('current')
      expect(f.cards().filter(card => ['previous', 'current', 'next'].includes(card.dataset.homeThemePosition!))).toHaveLength(3)
      for (const card of f.cards()) {
        if (card.dataset.homeThemePosition === 'outside') {
          expect(card.getAttribute('aria-hidden')).toBe('true')
          expect(card.tabIndex).toBe(-1)
        } else {
          expect(card.getAttribute('aria-hidden')).not.toBe('true')
          expect(card.tabIndex).toBeGreaterThanOrEqual(0)
        }
      }
    }
    check('default')
    for (const id of [...THEME_IDS.slice(1), 'default']) {
      f.click('next')
      await f.settle()
      check(id)
    }
    f.click('previous')
    await f.settle()
    check('lotustech')
    f.click('current')
    await f.settle()
    check('lotustech')
  })

  it('navigates and restores all nine themes with keyboard wrap and Home/End', async () => {
    const f = fixture({ initial: 'boz' })
    f.mount()
    expect(f.current()!.dataset.homeThemeId).toBe('boz')
    const key = async (value: string) => {
      f.current()!.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: value, bubbles: true }) as unknown as Event)
      await f.settle()
    }
    await key('End')
    expect(f.current()!.dataset.homeThemeId).toBe('lotustech')
    await key('ArrowRight')
    expect(f.current()!.dataset.homeThemeId).toBe('default')
    await key('ArrowLeft')
    expect(f.current()!.dataset.homeThemeId).toBe('lotustech')
    await key('Home')
    expect(f.current()!.dataset.homeThemeId).toBe('default')
    for (const id of THEME_IDS.slice(1)) {
      await key('ArrowRight')
      expect(f.current()!.dataset.homeThemeId).toBe(id)
      expect(f.win.document.activeElement?.getAttribute('data-home-theme-id')).toBe(id)
    }
  })

  it('restores a whitelisted preference and saves switches without changing the application light or dark mode', async () => {
    const f = fixture({ initial: 'jarrick' })
    f.win.document.body.setAttribute('data-ds-dark-theme', 'true')
    f.mount()
    expect(f.current()!.dataset.homeThemeId).toBe('jarrick')
    f.click('next')
    await f.settle()
    expect(f.win.localStorage.getItem(STORAGE_KEY)).toBe('lowfreez')
    expect(f.win.document.body.getAttribute('data-ds-dark-theme')).toBe('true')
    f.win.document.body.removeAttribute('data-ds-dark-theme')
    await f.settle()
    expect(f.current()!.dataset.homeThemeId).toBe('lowfreez')
    f.click('next')
    await f.settle()
    expect(f.win.document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(f.win.localStorage.getItem(STORAGE_KEY)).toBe('accelbia')
  })

  it.each(['not-a-theme', '{"id":"berber"}', '<img src=x onerror=alert(1)>'])('ignores an unknown stored preference: %s', (initial) => {
    const f = fixture({ initial })
    f.mount()
    expect(f.current()!.dataset.homeThemeId).toBe('default')
    expect(f.doc.querySelector('img')).toBeNull()
  })

  it('continues switching in memory when browser storage is unavailable', async () => {
    const f = fixture({ storageBlocked: true })
    expect(() => f.mount()).not.toThrow()
    expect(() => f.click('next')).not.toThrow()
    await f.settle()
    expect(f.current()!.dataset.homeThemeId).toBe('berber')
    expect(() => f.click('previous')).not.toThrow()
    await f.settle()
    expect(f.current()!.dataset.homeThemeId).toBe('default')
  })

  it('hides and pauses behind a workspace surface and replays entry only after returning home', async () => {
    const f = fixture()
    f.mount()
    const firstEntry = Number(f.dock()!.dataset.entryGeneration)
    expect(firstEntry).toBeGreaterThan(0)
    expect(f.frames.size).toBeGreaterThan(0)
    expect(f.background()!.dataset.renderState).toBe('running')
    f.step()
    expect(f.frames.size).toBeGreaterThan(0)
    for (const surface of ['notes', 'integrations']) {
      f.surface(surface)
      await f.settle()
      expect(visible(f.dock())).toBe(false)
      expect(visible(f.background())).toBe(false)
      expect(f.frames.size).toBe(0)
      expect(f.background()!.dataset.renderState).toBe('paused')
      f.surface()
      await f.settle()
      expect(visible(f.dock())).toBe(true)
      expect(visible(f.background())).toBe(true)
      expect(Number(f.dock()!.dataset.entryGeneration)).toBeGreaterThan(firstEntry)
    }
    const entry = f.dock()!.dataset.entryGeneration
    f.doc.querySelector('textarea')!.setAttribute('placeholder', '撰写消息')
    await f.settle()
    expect(f.dock()!.dataset.entryGeneration).toBe(entry)
  })

  it('does not leave the dock or rendering loop over a conversation, settings, or a subagent home', async () => {
    const f = fixture()
    f.mount()
    const home = f.doc.querySelector<HTMLElement>('.pI_x6G_centerCol [data-odyssey-page]')!
    home.dataset.odysseyPage = 'conversation'
    await f.settle()
    expect(visible(f.dock())).toBe(false)
    expect(f.frames.size).toBe(0)
    home.dataset.odysseyPage = 'home'
    await f.settle()
    expect(visible(f.dock())).toBe(true)
    const settings = f.doc.createElement('div')
    settings.className = 'VOzbGW_overlay'
    f.doc.body.append(settings)
    await f.settle()
    expect(visible(f.dock())).toBe(false)
    expect(f.frames.size).toBe(0)
    settings.hidden = true
    await f.settle()
    expect(visible(f.dock())).toBe(true)
    home.remove()
    await f.settle()
    expect(visible(f.dock())).toBe(false)
    expect(f.doc.querySelector('[data-odyssey-subagent-panel] [data-odyssey-theme-dock]')).toBeNull()
    expect(f.frames.size).toBe(0)
  })

  it('retains all switching behavior with reduced motion and no animation frames or entry animations', async () => {
    const f = fixture({ reducedMotion: true })
    f.mount()
    expect(visible(f.dock())).toBe(true)
    expect(f.frames.size).toBe(0)
    expect(f.animations).toHaveLength(0)
    expect(f.background()!.dataset.renderState).toBe('paused')
    f.click('next')
    await f.settle()
    expect(f.current()!.dataset.homeThemeId).toBe('berber')
    f.surface('notes')
    await f.settle()
    f.surface()
    await f.settle()
    expect(visible(f.dock())).toBe(true)
    expect(f.frames.size).toBe(0)
    expect(f.animations).toHaveLength(0)
  })

  it('disposes every owned surface and stops responding to later page events, then permits a clean remount', async () => {
    const f = fixture()
    const originalMarkup = f.doc.body.innerHTML
    const dispose = f.mount()
    dispose()
    dispose()
    expect(f.doc.querySelector('[data-odyssey-theme-dock]')).toBeNull()
    expect(f.background()).toBeNull()
    expect(f.doc.querySelector('canvas')).toBeNull()
    expect(f.frames.size).toBe(0)
    f.surface('notes')
    f.surface()
    await f.settle()
    expect(f.doc.querySelector('[data-odyssey-theme-dock]')).toBeNull()
    expect(f.frames.size).toBe(0)
    expect(f.doc.body.innerHTML).toBe(originalMarkup)
    expect(f.mount()).not.toBe(dispose)
    expect(f.doc.querySelectorAll('[data-odyssey-theme-dock]')).toHaveLength(1)
  })
})
