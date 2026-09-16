import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

describe('client focus decoration', () => {
  it('removes control focus rings without changing focused surface or canvas selection chrome', () => {
    const win = new Window(), doc = win.document
    const style = doc.createElement('style')
    style.textContent = 'button,input,dialog,[popover],[role=menu],[data-research-node-id]{outline:1px solid blue;box-shadow:0 0 2px blue}' + readFileSync(new URL('../src/preload/focus-style.css', import.meta.url), 'utf8')
    doc.head.append(style)
    doc.body.innerHTML = '<button>Button</button><input><dialog tabindex="-1"></dialog><div popover tabindex="-1"></div><div role="menu" tabindex="-1"></div><div data-research-node-id="test" data-selected="true" tabindex="0"></div>'
    for (const el of doc.body.children) {
      (el as any).focus()
      expect(win.getComputedStyle(el).outlineStyle).toBe(el.matches('button,input') ? 'none' : 'solid')
    }
  })
  it('retains permanent field strokes and state indicators while focused', () => {
    const win = new Window(), doc = win.document
    const style = doc.createElement('style')
    style.textContent = readFileSync(new URL('../src/preload/focus-style.css', import.meta.url), 'utf8')
    doc.head.append(style)
    doc.body.innerHTML = `<div data-research-create-popover class="odyssey-derived-create-popover" style="--odyssey-derived-border:#444"><textarea></textarea></div><div class="sherlock-auth-dialog" style="--auth-field-error-stroke:red"><input aria-invalid="true"></div><button class="GL8Viq_providerButtonSelected" style="--dsw-alias-brand-primary:blue"></button><div class="srb-notifications" style="--center-button-border:#444"><div class="srb-notification-footer"><button>打开看板</button></div></div>`
    for (const el of doc.querySelectorAll('textarea,input,button')) {
      const before = win.getComputedStyle(el)
      const stroke = [before.outline, before.boxShadow]
      ;(el as any).focus()
      const after = win.getComputedStyle(el)
      expect([after.outline, after.boxShadow]).toEqual(stroke)
      expect(el.matches('textarea') ? after.outlineStyle : after.boxShadow).not.toBe('none')
    }
  })

})
