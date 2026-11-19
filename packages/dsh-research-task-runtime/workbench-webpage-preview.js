import {boardFileWheelSuffix} from './workbench-frame-wheel.js'
import {webpageGeometryCss} from './workbench-webpage-compact.js'
import {validWorkbenchStyleMessage, workbenchModeCss} from './workbench-style.js'

// A portable page keeps its own defaults outside the board. Older generators
// used short CSS variable names and copied some of those colors into SVGs.
const roles = {
  bg:'bg', background:'bg', card:'surface', panel:'surface', surface:'surface', paper:'surface',
  ink:'text', text:'text', fg:'text', sub:'muted', muted:'muted', secondaryText:'muted',
  line:'border', border:'border', grid:'chart-grid', accent:'control-primary', primary:'control-primary',
  a:'chart-1', b:'chart-2', good:'market-positive', bad:'market-negative',
  positive:'market-positive', negative:'market-negative'
}

// Runs only inside the isolated preview document. The parent supplies a mode,
// never CSS, HTML, file paths or callbacks.
function installWebpagePreview(validMessage, aliases) {
  if (parent === window || !document.body) return
  const root = document.documentElement
  const authored = getComputedStyle(root)
  const known = new Map()
  function rgb(literal) {
    const color = literal.trim().toLowerCase()
    if (color === 'white') return [255,255,255]
    if (color === 'black') return [0,0,0]
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/.test(color)) {
      const hex = color.length === 4 ? [...color.slice(1)].map(c => c+c).join('') : color.slice(1)
      return hex.match(/../g).map(pair => parseInt(pair,16))
    }
    const match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(color)
    return match && match.slice(1).map(Number)
  }
  for (const [name, role] of Object.entries(aliases)) {
    const channels = rgb(authored.getPropertyValue('--'+name))
    if (channels) known.set(channels.join(','),role)
  }
  function paint(property, source) {
    const channels = rgb(source)
    if (!channels) return
    const brightest = Math.max(...channels), darkest = Math.min(...channels)
    const original = known.get(channels.join(','))
    const token = role => 'var(--sherlock-'+role+')'
    if (original && /^(?:chart-\d+|control-primary|market-)/.test(original)) return token(original)
    if (brightest-darkest > 48) return
    if (property === 'background-color') {
      if (brightest < 65) return token('text')
      if (darkest > 250) return token('surface')
      if (darkest > 220) return token('surface-muted')
      return token(darkest > 170 ? 'border' : 'muted')
    }
    if (property.startsWith('border')) return token('border')
    if (property === 'stroke') return token(darkest > 185 ? 'chart-grid' : 'chart-crosshair')
    if (property === 'fill') return token(original === 'text' ? 'text' : 'chart-label')
    return token(darkest > 245 ? 'bg' : brightest < 85 ? 'text' : 'muted')
  }
  const properties = ['color','background-color','border-top-color','border-right-color','border-bottom-color','border-left-color','fill','stroke']
  function adaptStyle(style) {
    if (!style?.length) return
    // Older pages set accent-color on each scenario's native slider. Let the
    // same palette token paint both its thumb and its selected track.
    const accent = style.getPropertyValue('accent-color').trim()
    if (/^var\(--(?:a|b|sherlock-chart-\d+)\)$/.test(accent) && style.getPropertyValue('--page-range-accent') !== accent) {
      style.setProperty('--page-range-accent',accent)
    }
    for (const property of properties) {
      const value = style.getPropertyValue(property)
      const next = value && paint(property,value)
      if (next) style.setProperty(property,next,style.getPropertyPriority(property))
    }
  }
  function adaptRules(rules) {
    for (const rule of rules) {
      if (rule.media?.mediaText === 'print') continue
      if (rule.style) adaptStyle(rule.style)
      if (rule.cssRules) adaptRules(rule.cssRules)
    }
  }
  function adaptElement(el) {
    if (el.tagName === 'STYLE' && !el.hasAttribute('data-workbench-page-style')) {
      if (el.sheet) adaptRules(el.sheet.cssRules)
    }
    if (el.hasAttribute('style')) adaptStyle(el.style)
    if (el.namespaceURI !== 'http://www.w3.org/2000/svg') return
    for (const property of ['fill','stroke']) {
      const value = el.getAttribute(property), next = value && paint(property,value)
      if (next) el.setAttribute(property,next)
    }
  }
  const painted = 'style,[style],[fill],[stroke]'
  function adaptTree(el) {
    if (el.nodeType !== 1) return
    if (el.matches(painted)) adaptElement(el)
    el.querySelectorAll(painted).forEach(adaptElement)
  }
  const style = document.currentScript.previousElementSibling
  let lastWidth = 0, lastHeight = 0, frame = 0
  function report() {
    frame = 0
    const body = document.body, box = body.getBoundingClientRect()
    const width = window.innerWidth
    // The body flows at this width. The root's scrollHeight also includes the
    // current viewport, which would stop a short page from ever shrinking.
    const height = Math.min(12000,Math.ceil(box.bottom+scrollY+(parseFloat(getComputedStyle(body).marginBottom)||0)))
    if (width < 1 || height < 1 || (width === lastWidth && height === lastHeight)) return
    lastWidth = width
    lastHeight = height
    parent.postMessage({type:'sherlock-workbench-content-size',width,height},'*')
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(report)
  }
  let installed = false
  addEventListener('message', event => {
    if (event.source !== parent || !validMessage(event.data)) return
    root.dataset.workbenchStyle = event.data.mode
    if (!installed) {
      installed = true
      adaptTree(root)
      new MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'attributes') adaptElement(record.target)
          else if (record.target.tagName === 'STYLE' && record.target !== style) adaptElement(record.target)
          else record.addedNodes.forEach(adaptTree)
        }
        schedule()
      }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['style','fill','stroke']})
      new ResizeObserver(schedule).observe(document.body)
      addEventListener('resize',schedule)
      document.fonts?.ready.then(schedule)
    }
    schedule()
    dispatchEvent(new CustomEvent('sherlock-presentation-change',{detail:{mode:event.data.mode}}))
  })
}

const aliasCss = Object.entries(roles).map(([name,role]) => '--'+name+':var(--sherlock-'+role+')!important').join(';')
const pageCss = workbenchModeCss() + `
@media screen {
  :root[data-workbench-style] { --page-accent:var(--sherlock-control-primary); }
  :root[data-workbench-style="enterprise"] { --page-accent:var(--sherlock-chart-1); }
  ${webpageGeometryCss(':root[data-workbench-style]')}
  :root[data-workbench-style]{${aliasCss};--a-soft:color-mix(in srgb,var(--a) 15%,var(--card))!important;--b-soft:color-mix(in srgb,var(--b) 15%,var(--card))!important;color-scheme:light}
  :root:is([data-workbench-style="dark"],[data-workbench-style="openterminal"]){color-scheme:dark}
  :root[data-workbench-style],:root[data-workbench-style] body{height:auto!important;min-height:0!important;background-color:var(--sherlock-bg)!important;color:var(--sherlock-text)!important}
  :root[data-workbench-style] body>:where(main,#root,#app,.app,.page,.wrap){min-height:0!important;height:auto!important}
  @layer workbench-compact {
    :where(:root[data-workbench-style]) :where(input,select,button,textarea){color:inherit;accent-color:var(--sherlock-control-primary)}
    :where(:root[data-workbench-style]) :where(:focus-visible){outline-color:var(--sherlock-control-primary)}
  }
}`

export const workbenchWebpagePreviewSuffix = '\n<style data-workbench-page-style>'+pageCss+'</style><script>('+
  installWebpagePreview.toString()+')('+validWorkbenchStyleMessage.toString()+','+JSON.stringify(roles)+')</script>'+boardFileWheelSuffix
