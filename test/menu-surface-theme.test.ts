import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { integrationStyles } from '../src/preload/integrations/style'
import { scheduledStyles } from '../src/preload/scheduled/style'
// @ts-expect-error Runtime bundle patcher is a JavaScript build script.
import { patchSkillCommandLabels, patchSkillCommandPopup } from '../scripts/lib/skill-command-menu.mjs'
import { noteMenuDocumentHtml } from '../src/main/notes/native-menu'

it('shares a neutral translucent material across workspace, account, more, and integration menus in both themes', async () => {
  const win = new Window(), doc = win.document
  doc.head.innerHTML = `<style>${readFileSync('src/preload/figma-panels.css','utf8')}${readFileSync('src/preload/figma-refinements.css','utf8')}${integrationStyles}${scheduledStyles}</style>`
  doc.body.innerHTML = '<div role="menu" id="workspace"><input class="odyssey-workspace-search"><button role="menuitem">测试集</button></div><div class="sherlock-account-menu" id="account"><button>设置</button></div><div class="st-menu" id="more" role="menu"><button>插件</button></div><section class="ig-root"><div class="ig-menu" id="plugin" role="menu"><button>查看详情</button></div></section><div data-odyssey-tab-overflow-menu role="menu" id="overflow"><button role="menuitemradio">对话</button></div><dialog class="srb-session-search" id="search"></dialog><div class="rScV5Q_contextMenu" id="context"></div>'
  try {
    for (const dark of [false,true]) {
      doc.body.toggleAttribute('data-ds-dark-theme',dark)
      doc.querySelector('.ig-root')!.setAttribute('data-dark',String(dark))
      doc.querySelector('.st-menu')!.setAttribute('data-dark',String(dark))
      expect(win.getComputedStyle(doc.body).backgroundColor).toBe(dark ? '#1f1f1f' : '#f2f2f2')
      for (const id of ['workspace','account','more','plugin','overflow','search','context']) {
        const css=win.getComputedStyle(doc.getElementById(id)!)
        expect(css.backgroundColor,id).toBe(dark ? 'rgba(43, 43, 43, 0.68)' : 'rgba(255, 255, 255, 0.78)')
        expect(css.backdropFilter,id).toBe('blur(36px) saturate(1.2)')
      }
    }
  } finally { await win.happyDOM.close() }
})

it('keeps expanded slash and skill menus and Notes menus on the workspace material after native styles load', async () => {
  const win = new Window(), doc = win.document
  const nativeCss = [
    patchSkillCommandLabels(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')),
    patchSkillCommandPopup(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8'))
  ].map(source => JSON.parse(source.match(/const css = ("[^\n]+");/u)![1])).join('\n')
  doc.head.innerHTML = `<style>${readFileSync('src/preload/figma-refinements.css','utf8')}${readFileSync('src/preload/notes/style.css','utf8')}${nativeCss}</style>`
  doc.body.innerHTML = '<div role="menu" id="workspace"></div><div class="_3e4SsG_menu" data-ework-expanded-command id="slash"></div><div class="mufS8W_card" data-ework-expanded-command id="skills"></div><div class="srb-notifications" id="notifications"></div><div class="en-block-menu" id="note-block"></div><div class="en-export-menu" id="note-export"></div><div class="mantine-Menu-dropdown" id="note-format"></div><div class="en-root" id="note-document"></div>'
  try {
    for (const dark of [false,true]) {
      doc.body.toggleAttribute('data-ds-dark-theme',dark)
      const workspace=win.getComputedStyle(doc.getElementById('workspace')!)
      for (const id of ['slash','skills','notifications','note-block','note-export','note-format']) {
        const css=win.getComputedStyle(doc.getElementById(id)!)
        expect(css.backgroundColor,id).toBe(workspace.backgroundColor)
        expect(css.backdropFilter,id).toBe('blur(36px) saturate(1.2)')
        // Shadow variable fallbacks are verified in real Chromium; happy-dom
        // leaves nested rgba() fallbacks unresolved in computed box-shadow.
      }
      expect(win.getComputedStyle(doc.getElementById('note-document')!).backdropFilter).not.toBe('blur(36px) saturate(1.2)')
    }
    const native = new Window()
    try {
      native.document.write(noteMenuDocumentHtml)
      native.document.querySelector('main')!.innerHTML='<section class="menu"><a>段落</a></section>'
      for(const dark of [false,true]) {
        native.document.body.classList.toggle('dark',dark)
        const css=native.getComputedStyle(native.document.querySelector('.menu')!)
        expect(css.backgroundColor).toBe(dark ? 'rgba(43, 43, 43, 0.68)' : 'rgba(255, 255, 255, 0.78)')
        expect(css.backdropFilter).toBe('blur(36px) saturate(1.2)')
      }
    } finally { await native.happyDOM.close() }
  } finally { await win.happyDOM.close() }
})
