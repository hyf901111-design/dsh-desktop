import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { integrationStyles } from '../src/preload/integrations/style'
import { scheduledStyles } from '../src/preload/scheduled/style'

it('shares a neutral translucent material across workspace, account, more, and integration menus in both themes', async () => {
  const win = new Window(), doc = win.document
  doc.head.innerHTML = `<style>${readFileSync('src/preload/figma-panels.css','utf8')}${readFileSync('src/preload/figma-refinements.css','utf8')}${integrationStyles}${scheduledStyles}</style>`
  doc.body.innerHTML = '<div role="menu" id="workspace"><input class="odyssey-workspace-search"><button role="menuitem">测试集</button></div><div class="sherlock-account-menu" id="account"><button>设置</button></div><div class="st-menu" id="more" role="menu"><button>插件</button></div><section class="ig-root"><div class="ig-menu" id="plugin" role="menu"><button>查看详情</button></div></section><div data-odyssey-tab-overflow-menu role="menu" id="overflow"><button role="menuitemradio">对话</button></div>'
  try {
    for (const dark of [false,true]) {
      doc.body.toggleAttribute('data-ds-dark-theme',dark)
      doc.querySelector('.ig-root')!.setAttribute('data-dark',String(dark))
      doc.querySelector('.st-menu')!.setAttribute('data-dark',String(dark))
      for (const id of ['workspace','account','more','plugin','overflow']) {
        const css=win.getComputedStyle(doc.getElementById(id)!)
        expect(css.backgroundColor,id).toBe(dark ? 'rgba(43, 43, 43, 0.82)' : 'rgba(255, 255, 255, 0.86)')
        expect(css.backdropFilter,id).toBe('blur(24px)')
      }
    }
  } finally { await win.happyDOM.close() }
})
