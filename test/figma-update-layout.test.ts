import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { installSidebarNoticeStyles } from '../src/preload/sidebar-notice'

it('keeps notice inside strokes out of the action width, including primary and close controls', () => {
  const win = new Window()
  installSidebarNoticeStyles(win.document as unknown as Document)
  win.document.body.innerHTML = '<aside class="ework-sidebar-notice"><button>详情</button><button class="ework-notice-primary">更新</button><button class="ework-notice-close">×</button></aside><aside class="srb-bubble ework-sidebar-notice"><button class="srb-primary">接受</button></aside>'
  const [secondary, primary, close, invitation] = [...win.document.querySelectorAll('button')].map(el => win.getComputedStyle(el))
  expect(secondary.borderLeftWidth).toBe('0px')
  expect(secondary.paddingLeft).toBe('10px')
  expect(secondary.height).toBe('26px')
  expect(secondary.boxShadow).toContain('inset 0 0 0 1px')
  for (const style of [primary, close, invitation]) expect(style.boxShadow).toBe('none')
  expect(close.width).toBe('12px')
  win.happyDOM.abort()
})

it('applies distinct checking and verification treatment after the real About CSS', async () => {
  const win = new Window()
  const vendor = await readFile('node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js', 'utf8')
  const css = JSON.parse(vendor.match(/const sherlockAboutCss = ("(?:\\.|[^"\\])*");/)![1])
  for (const text of [css, await readFile('src/preload/figma-settings.css', 'utf8')]) {
    const style = win.document.createElement('style'); style.textContent = text; win.document.head.append(style)
  }
  win.document.body.innerHTML = '<div class="VOzbGW_overlay"><div class="sherlock-about"><p class="sherlock-about-version">当前版本 0.9.4</p><button disabled class="sherlock-about-check"><span class="sherlock-about-action-icon" data-loading="false"></span></button></div></div>'
  const about = win.document.querySelector('.sherlock-about')!
  const button = win.document.querySelector('button')!
  const icon = win.document.querySelector('.sherlock-about-action-icon')!
  for (const phase of ['checking', 'downloading']) {
    about.setAttribute('data-about-update-phase', phase)
    expect(Number(win.getComputedStyle(button).opacity)).toBe(0.6)
  }
  expect(win.getComputedStyle(icon).animation).toBe('sherlock-about-spin 900ms linear infinite')
  for (const phase of ['downloaded', 'installing']) {
    about.setAttribute('data-about-update-phase', phase)
    expect(Number(win.getComputedStyle(button).opacity)).toBe(0.65)
  }
  win.document.body.setAttribute('data-ds-dark-theme', '')
  expect(win.getComputedStyle(about).getPropertyValue('--about-text')).toBe('#e9e9e9')
  expect(win.getComputedStyle(about).getPropertyValue('--about-button')).toBe('rgba(255,255,255,.085)')
  win.happyDOM.abort()
})
