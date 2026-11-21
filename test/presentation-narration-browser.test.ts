import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { handleEditorAsset } from '../src/main/presentation/protocol'
import { blankDeck } from '../src/main/presentation/store'
import { PRESENTATION_EDIT_GUIDE_CONTENT as guide } from '../src/shared/presentation-edit-guide-content'

it('ships a matching MP3 for every final speaker note in the investment committee demo', () => {
  for (const [i, original] of guide.notes.entries()) {
    const edit = guide.notesSelection
    const text = i + 1 === edit.page ? original.replace(edit.quote, edit.replacement) : original
    const hash = createHash('sha256').update(text.trim()).digest('hex')
    const bytes = readFileSync('packages/presentation-editor/guide-narration/' + hash + '.mp3')
    expect(bytes.length).toBeGreaterThan(10000)
  }
})

it('plays bundled notes, resumes mid-sentence, advances on audio end and waits on a blank slide', async () => {
  const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright')
  const browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage({ viewport: { width: 1350, height: 760 } })
    const deck = blankDeck('用例放映')
    deck.slides = [guide.notes[0], guide.notes[1], guide.notes[2], ' ', guide.notes[4]].map((note, i) => ({
      ...deck.slides[0]!, id: 'page-' + i, remark: note!.split('\n').map(line => '<p>' + line + '</p>').join('')
    }))
    await page.route('http://localhost/**', async (route: any) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' })
      const response = await handleEditorAsset(process.cwd(), new Request('odyssey-presentation://editor' + path))
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
    })
    // Accelerate real media time and retain the element to check pause/resume.
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        ;(window as any).testAudio = this
        this.playbackRate = 8
        return play.call(this)
      }
    })
    await page.goto('http://localhost/')
    await page.evaluate((deck: any) => {
      const frame = document.createElement('iframe')
      frame.allow = 'fullscreen; autoplay'
      frame.style.cssText = 'width:100vw;height:100vh;border:0'
      document.body.dataset.cloud = '0'
      window.addEventListener('message', e => {
        if (e.source !== frame.contentWindow) return
        const p = e.data
        if (p.type === 'ready') frame.contentWindow!.postMessage({ channel: p.channel, type: 'load',
          record: { deck, revision: 1 }, editable: true, dark: true }, location.origin)
        if (p.type === 'narrate') document.body.dataset.cloud = String(Number(document.body.dataset.cloud) + 1)
      })
      frame.src = '/index.html?host=' + encodeURIComponent(location.origin)
      document.body.append(frame)
    }, deck)
    const editor = page.frameLocator('iframe')
    await editor.locator('footer').getByRole('button', { name: '播放演示文稿' }).waitFor()
    await page.evaluate((id: string) => document.querySelector('iframe')!.contentWindow!.postMessage({
      channel: 'odyssey-presentation', type: 'edit-guide', command: 'click', target: 'play', documentId: id
    }, location.origin), deck.id)
    await editor.locator('.theater .narration-button').waitFor()
    await page.evaluate((id: string) => document.querySelector('iframe')!.contentWindow!.postMessage({
      channel: 'odyssey-presentation', type: 'edit-guide', command: 'click', target: 'narrate', documentId: id
    }, location.origin), deck.id)
    const control = editor.locator('.narration-button')
    const state = () => control.getAttribute('data-state')
    const time = () => control.evaluate((el: Element) => (el.ownerDocument.defaultView as any).testAudio.currentTime)
    const expectVoicedAudio = async () => {
      const rms = await control.evaluate(async (el: Element) => {
        const audio: HTMLAudioElement = (el.ownerDocument.defaultView as any).testAudio
        if (audio.muted || audio.paused || !audio.volume) return 0
        const response = await fetch(audio.currentSrc)
        const decoder = new OfflineAudioContext(1, 1, 24000)
        const track = await decoder.decodeAudioData(await response.arrayBuffer())
        const opening = track.getChannelData(0).subarray(0, 2 * track.sampleRate)
        const power = opening.reduce((sum, sample) => sum + sample * sample, 0)
        return audio.volume * Math.sqrt(power / opening.length)
      })
      expect(rms).toBeGreaterThan(0.01)
    }
    await expect.poll(state).toBe('playing')
    await expectVoicedAudio()
    // Tab focus remains visible on the dark controls without a blue focus ring.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    expect(await control.evaluate((el: Element) => [el.matches(':focus-visible'), getComputedStyle(el).outlineStyle, getComputedStyle(el).backgroundColor]))
      .toEqual([true, 'none', 'rgb(104, 104, 104)'])
    await expect.poll(time).toBeGreaterThan(0.5)
    await control.click()
    expect(await state()).toBe('paused')
    const paused = await time()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(await time()).toBeCloseTo(paused, 2)
    await control.click()
    await expect.poll(time).toBeGreaterThan(paused)
    const nav = editor.locator('.theater nav')
    await expect.poll(() => nav.innerText(), { timeout: 10000 }).toContain('2 / 5')
    await expect.poll(state).toBe('playing')
    await expectVoicedAudio()
    await expect.poll(() => nav.innerText(), { timeout: 10000 }).toContain('3 / 5')
    await expect.poll(state).toBe('playing')
    await expect.poll(() => nav.innerText(), { timeout: 10000 }).toContain('4 / 5')
    expect(await control.isDisabled()).toBe(true)
    await editor.getByRole('button', { name: '下一页' }).click()
    expect(await control.isEnabled()).toBe(true)
    expect(await state()).toBe('idle')
    await control.click()
    await expect.poll(state).toBe('playing')
    await expect.poll(state, { timeout: 10000 }).toBe('idle')
    expect(await nav.innerText()).toContain('5 / 5')
    expect(await page.locator('body').getAttribute('data-cloud')).toBe('0')
    await editor.getByRole('button', { name: /退出放映/ }).click()
    await page.setViewportSize({ width: 800, height: 650 })
    const secondSlide = editor.locator('.page-row').nth(1)
    await secondSlide.click()
    const footer = editor.locator('footer')
    const footerInk = (label: string) => footer.getByRole('button', { name: label, exact: true }).locator('img').evaluate(async (img: HTMLImageElement) => {
      const svg = new DOMParser().parseFromString(await (await fetch(img.src)).text(), 'image/svg+xml')
      return [svg.querySelector('[stroke]')!.getAttribute('stroke'), getComputedStyle(img).filter]
    })
    expect(await footerInk('播放演示文稿')).toEqual(await footerInk('全屏'))
    await footer.getByRole('button', { name: '播放演示文稿' }).click()
    expect(await nav.innerText()).toContain('2 / 5')
    await page.keyboard.press('Escape')
    await expect.poll(() => nav.count()).toBe(0)
    expect(await secondSlide.getAttribute('aria-current')).toBe('page')
  } finally { await browser.close() }
}, 45000)
