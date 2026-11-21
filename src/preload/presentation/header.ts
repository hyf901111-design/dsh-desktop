import headerEditLock from '../../shared/header-edit-lock.json'
import { browserIcons } from '../browser/icons'
import { sheetIcon } from '../spreadsheet/icons'

type State = { hasDeck: boolean; writable: boolean; locked: boolean; busy: boolean }
type Actions = { toggle(): Promise<void>; import(file: File): void; export(): void; archive(): void }

export function presentationHeader(doc: Document, actions: Actions) {
  const lock = doc.createElement('button'),
    more = doc.createElement('button'),
    file = doc.createElement('input')
  lock.type = more.type = 'button'
  more.innerHTML = sheetIcon('more')
  more.setAttribute('aria-haspopup', 'menu')
  file.type = 'file'
  file.accept = '.pptx'
  file.hidden = true
  let menu: HTMLElement | undefined,
    parent: HTMLElement | null = null,
    previous = ''
  let state: State = { hasDeck: false, writable: false, locked: false, busy: true }
  const close = () => {
    menu?.remove()
    menu = undefined
    more.setAttribute('aria-expanded', 'false')
  }
  lock.onclick = () => {
    close()
    void actions.toggle()
  }
  file.onchange = () => {
    const selected = file.files?.[0]
    file.value = ''
    if (selected) actions.import(selected)
  }
  more.onclick = () => {
    if (menu) {
      close()
      return
    }
    const en = doc.documentElement.dataset.odysseyLocale === 'en'
    menu = doc.createElement('div')
    menu.className = 'presentation-header-menu'
    menu.role = 'menu'
    const item = (title: string, icon: 'external' | 'download' | 'book', disabled: boolean, run: () => void) => {
      const b = doc.createElement('button')
      b.type = 'button'
      b.role = 'menuitem'
      b.disabled = disabled
      const glyph = doc.createElement('i')
      glyph.className = 'ew-sheet-browser-icon'
      glyph.setAttribute('aria-hidden', 'true')
      glyph.style.setProperty('--menu-icon', 'url("' + browserIcons[icon].replaceAll('"', '%22') + '")')
      b.append(glyph, title)
      b.onclick = () => {
        close()
        run()
      }
      menu!.append(b)
    }
    item(
      en ? 'Import PowerPoint…' : '导入 PowerPoint…',
      'external',
      !state.writable || state.locked || state.busy,
      () => file.click()
    )
    item(en ? 'Export PowerPoint…' : '导出 PowerPoint…', 'download', !state.hasDeck || state.busy, actions.export)
    item(en ? 'Save to Knowledge…' : '保存至知识库…', 'book', !state.hasDeck || state.busy, actions.archive)
    doc.body.append(menu)
    const rect = more.getBoundingClientRect()
    menu.style.left = Math.max(6, rect.right - menu.offsetWidth) + 'px'
    menu.style.top = Math.min(rect.bottom + 4, doc.documentElement.clientHeight - menu.offsetHeight - 4) + 'px'
    more.setAttribute('aria-expanded', 'true')
    menu.querySelector<HTMLButtonElement>('button:enabled')?.focus()
  }
  const outside = (e: Event) => {
    if (menu && !menu.contains(e.target as Node) && !more.contains(e.target as Node)) close()
  }
  const key = (e: KeyboardEvent) => {
    if (!menu) return
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      more.focus()
    } else if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      const items = [...menu.querySelectorAll<HTMLButtonElement>('button:enabled')]
      items[
        (items.indexOf(doc.activeElement as HTMLButtonElement) + (e.key === 'ArrowDown' ? 1 : -1) + items.length) %
          items.length
      ]?.focus()
    }
  }
  doc.addEventListener('pointerdown', outside, true)
  doc.addEventListener('keydown', key, true)
  doc.addEventListener('sherlock:workspace-pointerdown', close)
  return {
    paint(next: HTMLElement | null, value: State) {
      state = value
      const en = doc.documentElement.dataset.odysseyLocale === 'en',
        named = !state.writable
          ? headerEditLock.readOnly
          : state.locked
            ? headerEditLock.locked
            : headerEditLock.unlocked
      if (next !== parent || (next && !next.contains(more))) {
        close()
        parent = next
        previous = ''
        if (next) next.replaceChildren(lock, more, file)
      }
      if (!next) return
      const signature = JSON.stringify([state, en])
      if (signature === previous) return
      previous = signature
      const locked = state.locked || !state.writable
      lock.innerHTML = sheetIcon(locked ? 'lock' : 'lock-open')
      lock.title = named[en ? 'en' : 'zh']
      lock.setAttribute('aria-label', lock.title)
      lock.setAttribute('aria-pressed', String(locked))
      lock.disabled = !state.writable || state.busy
      more.title = en ? 'More presentation actions' : '更多演示操作'
      more.setAttribute('aria-label', more.title)
    },
    dispose() {
      close()
      lock.remove()
      more.remove()
      file.remove()
      doc.removeEventListener('pointerdown', outside, true)
      doc.removeEventListener('keydown', key, true)
      doc.removeEventListener('sherlock:workspace-pointerdown', close)
    }
  }
}
