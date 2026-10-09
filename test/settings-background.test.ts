import { readFile } from 'node:fs/promises'
import { Window, type Element } from 'happy-dom'
import { expect, it } from 'vitest'

it('hides research toolbar portals in settings and restores the mounted canvas after close', async () => {
  const win = new Window(), doc = win.document
  const style = doc.createElement('style')
  style.textContent = await readFile('src/preload/figma-settings.css', 'utf8')
  doc.head.append(style)
  doc.body.innerHTML = '<div class="pI_x6G_frame"><div data-research-canvas>保留研究组件</div><aside></aside></div><div data-ework-toolbar data-ework-toolbar-owner="research" style="visibility:visible"><button style="visibility:visible">选择</button></div><div data-ework-toolbar-owner="research" role="menu" style="visibility:visible">整理组件</div>'
  const canvas = doc.querySelector('[data-research-canvas]')!
  const toolbar = doc.querySelector('[data-ework-toolbar]')!
  const portals = [...doc.querySelectorAll('[data-ework-toolbar-owner], [data-ework-toolbar-owner] button')]
  const visibility = (node: Element) => win.getComputedStyle(node).visibility
  const overlay = doc.createElement('div')
  overlay.className = 'VOzbGW_overlay'
  overlay.innerHTML = '<button>返回应用</button>'
  const settingsMenu = doc.createElement('div')
  settingsMenu.setAttribute('role', 'listbox')
  settingsMenu.style.visibility = 'visible'
  settingsMenu.textContent = '标准模式'
  // happy-dom needs ancestor invalidation for :has() after descendant attribute changes.
  const invalidateStyle = (state: string) => { doc.body.dataset.testSettingsState = state }
  try {
    expect(portals.map(visibility)).toEqual(['visible', 'visible', 'visible'])
    doc.querySelector('aside')!.append(overlay)
    doc.body.append(settingsMenu)
    expect(portals.map(visibility)).toEqual(['hidden', 'hidden', 'hidden'])
    expect(portals.map(node => win.getComputedStyle(node).pointerEvents)).toEqual(['none', 'none', 'none'])
    expect(visibility(settingsMenu)).toBe('visible')
    overlay.hidden = true
    invalidateStyle('hidden')
    expect(portals.map(visibility)).toEqual(['visible', 'visible', 'visible'])
    overlay.hidden = false
    invalidateStyle('reopened')
    expect(portals.map(visibility)).toEqual(['hidden', 'hidden', 'hidden'])
    overlay.remove()
    invalidateStyle('closed')
    expect(portals.map(visibility)).toEqual(['visible', 'visible', 'visible'])
    expect(doc.querySelector('[data-ework-toolbar]')).toBe(toolbar)
    expect(doc.querySelector('[data-research-canvas]')).toBe(canvas)
    expect(canvas.textContent).toBe('保留研究组件')
  } finally {
    await win.happyDOM.close()
  }
})
