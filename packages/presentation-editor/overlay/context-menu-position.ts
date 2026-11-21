import type { ObjectDirective } from 'vue'

type Point = { x: number; y: number }
const gutter = 4
const cleanup = new WeakMap<HTMLElement, () => void>()

function constrain(start: number, size: number, limit: number) {
  return Math.max(gutter, Math.min(start, limit - size - gutter))
}

export const vFitContextMenu: ObjectDirective<HTMLElement, Point> = {
  mounted(popup, { value: point }) {
    const layout = () => {
      const width = document.documentElement.clientWidth
      const height = document.documentElement.clientHeight
      const root = popup.firstElementChild as HTMLElement
      const x = point.x + root.offsetWidth <= width - gutter ? point.x : point.x - root.offsetWidth
      const y = point.y + root.offsetHeight <= height - gutter ? point.y : point.y - root.offsetHeight
      popup.style.left = constrain(x, root.offsetWidth, width) + 'px'
      popup.style.top = constrain(y, root.offsetHeight, height) + 'px'
      for (const child of popup.querySelectorAll<HTMLElement>('.sub-menu')) {
        if (!child.offsetWidth) continue
        const row = child.closest('li')!.getBoundingClientRect()
        const leftRoom = row.left - gutter
        const rightRoom = width - row.right - gutter
        const flip = rightRoom < child.offsetWidth && leftRoom > rightRoom
        const left = flip ? row.left - child.offsetWidth + 1 : row.right - 1
        child.style.left = constrain(left, child.offsetWidth, width) + 'px'
        child.style.top = constrain(row.top - 6, child.offsetHeight, height) + 'px'
        child.parentElement!.classList.toggle('opens-left', flip)
      }
    }
    // The submenu is CSS-hover driven. At mouseover its real box is measurable.
    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(popup)
    popup.addEventListener('mouseover', layout)
    popup.addEventListener('scroll', layout, true)
    window.addEventListener('resize', layout)
    cleanup.set(popup, () => {
      observer.disconnect()
      popup.removeEventListener('mouseover', layout)
      popup.removeEventListener('scroll', layout, true)
      window.removeEventListener('resize', layout)
    })
  },
  unmounted(popup) {
    cleanup.get(popup)?.()
    cleanup.delete(popup)
  },
}
