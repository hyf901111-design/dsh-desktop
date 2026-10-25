import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'

it('keeps portal child reading and readonly footer independent of the central bottom dock', async () => {
  const win = new Window(), doc = win.document
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const native = [...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match => JSON.parse(match[1]!)).join('\n')
  const styles = await Promise.all(['figma-final-shell', 'figma-panels', 'figma-refinements', 'figma-reading'].map(name => readFile(`src/preload/${name}.css`, 'utf8')))
  doc.head.innerHTML = `<style>${native}\n${styles.join('\n')}</style>`
  const conversation = `<div class="wSkVaW_root" data-odyssey-page="conversation">
    <div class="wSkVaW_scrollBody" data-conversation-scroll><div class="Md3f7G_scroll"><div class="Md3f7G_column">
      <div class="Sxvs8a_root"><div class="Sxvs8a_body"><div class="_markdown_1nba0_5">真实执行记录</div></div></div>
    </div></div></div>
    <div data-center-composer-host><div class="wSkVaW_composerSeat"><div class="XJ7liG_frame">一次性子代理记录</div></div></div>
  </div>`
  try {
    // D21 mounts through display:contents portal wrappers, not a direct child.
    doc.body.innerHTML = `<main>${conversation}<section data-odyssey-subagent-panel><div style="display:contents">${conversation}</div></section></main>`
    const parent = doc.querySelector('main')!, panel = doc.querySelector('[data-odyssey-subagent-panel]')!
    const childStyle = (selector: string) => win.getComputedStyle(panel.querySelector(selector)!)
    for (const bottom of [0, 220]) {
      parent.style.setProperty('--dsh-sidebar-height', `${bottom}px`)
      expect(win.getComputedStyle(parent.querySelector('.wSkVaW_root')!).height).toBe(`calc(100% - ${bottom}px)`)
      expect(childStyle('.wSkVaW_root').height).toBe('100%')
      expect(childStyle('.wSkVaW_root').getPropertyValue('--dsh-sidebar-height')).toBe('0px')
      expect(childStyle('.wSkVaW_scrollBody').marginTop).toBe('15px')
      expect(childStyle('.wSkVaW_scrollBody').overflowY).toBe('auto')
      expect(childStyle('.Md3f7G_scroll').padding).toBe('0px 16px')
      expect(childStyle('[data-center-composer-host]').padding).toBe('16px 0px 12px')
      expect(childStyle('.XJ7liG_frame').margin).toBe('0px 16px')
      expect(childStyle('.XJ7liG_frame').minHeight).toBe('120px')
      expect(childStyle('[class*=_markdown_]').fontSize).toBe('14px')
      expect(childStyle('[class*=_markdown_]').lineHeight).toBe('24px')
    }
    // Current accepted central composer baseline; the child remains independent.
    expect(win.getComputedStyle(parent.querySelector('[data-center-composer-host]')!).padding).toBe('4px 0px 12px')
  } finally {
    await win.happyDOM.close()
  }
})
