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
})
