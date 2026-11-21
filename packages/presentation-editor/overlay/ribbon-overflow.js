import { shallowRef, watch } from 'vue'

// Measure the native controls, including the current font selectors and optional
// object tools. A tool is either wholly on the ribbon or available in its menu.
export function useRibbonOverflow(ribbon, onFit) {
  const overflow = shallowRef([])
  watch(ribbon, (bar, _, cleanup) => {
    if (!bar) return
    const more = bar.querySelector('[data-ribbon-more]')
    function fit() {
      if (!bar.isConnected) return
      const tools = [...bar.children].filter(el => el !== more)
      for (const el of [...tools, more]) el.removeAttribute('data-ribbon-folded')
      const style = getComputedStyle(bar), gap = parseFloat(style.columnGap) || 0
      const space = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const widths = tools.map(el => {
        const css = getComputedStyle(el)
        return el.getBoundingClientRect().width + parseFloat(css.marginLeft) + parseFloat(css.marginRight)
      })
      let used = widths.reduce((sum, width) => sum + width, 0) + gap * (tools.length - 1)
      let count = tools.length
      if (used > space) {
        used += more.getBoundingClientRect().width + gap
        while (count > 1 && used > space) used -= widths[--count] + gap
        while (count > 1 && tools[count - 1].tagName === 'I') count--
      }
      const folded = tools.slice(count)
      folded.forEach(el => el.setAttribute('data-ribbon-folded', ''))
      const commands = folded.filter(el => el.matches('button,select'))
      more.toggleAttribute('data-ribbon-folded', !commands.length)
      overflow.value = commands
      onFit(more, commands.length)
    }
    const size = new ResizeObserver(fit)
    const content = new MutationObserver(fit)
    size.observe(bar)
    content.observe(bar, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'aria-pressed', 'title'] })
    document.fonts.addEventListener('loadingdone', fit)
    cleanup(() => {
      size.disconnect()
      content.disconnect()
      document.fonts.removeEventListener('loadingdone', fit)
    })
    fit()
  }, { flush: 'post' })
  return overflow
}
