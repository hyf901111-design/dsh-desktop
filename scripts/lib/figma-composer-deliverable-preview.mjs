import {readFileSync} from 'node:fs'

/** Use the canonical reference identity, never text that merely looks like a tag. */
export function composerDeliverableKind(draft, occurrences) {
  let kind, lastOffset = -1
  for (const occurrence of occurrences) {
    if (occurrence.source !== 'ework-managed-skill' || !Number.isSafeInteger(occurrence.offset) || occurrence.offset < 0 || draft[occurrence.offset] !== '\uFFFC') continue
    try {
      const reference = JSON.parse(occurrence.ref)
      const candidate = reference?.id === 'builtin:efund-ppt-maker' ? 'ppt'
        : reference?.id === 'builtin:ework-equity-research' ? 'report' : undefined
      if (candidate && occurrence.offset >= lastOffset) { kind = candidate; lastOffset = occurrence.offset }
    } catch { /* A malformed reference cannot borrow a built-in decoration. */ }
  }
  return kind
}

/** Static Figma geometry; no timers, input handlers or generated-file semantics. */
export function renderComposerDeliverablePreview(jsx, kind, assets) {
  if (!kind) return null
  const ppt = kind === 'ppt', width = ppt ? 120 : 88, height = ppt ? 67.5 : 118
  const box = (x, y, w, h) => ({left: `${x / width * 100}%`, top: `${y / height * 100}%`, width: `${w / width * 100}%`, height: `${h / height * 100}%`})
  const bars = ppt ? [[8,17,42,2.8],[8,23,30,1.7],[8,44,18,1.3],[8,49,28,1.3],[8,60.2,56,.9],[8,63.2,44,.9]]
    : [[8,20,40,2.8],[8,26,28,1.7],[8,42,18,1.4],[8,47,30,1.4],[8,78,40,1.4],[8,83,32,1.4],[8,88,24,1.4],[8,108.8,40,.9],[8,112.3,32,.9]]
  const photograph = jsx.jsx('img', {className:'odyssey-deliverable-template', src:assets.template, alt:'', draggable:false})
  return jsx.jsx('div', {className:'odyssey-deliverable-preview', 'data-odyssey-deliverable-art':kind, 'aria-hidden':true,
    children:jsx.jsx('div', {className:'odyssey-deliverable-artboard', children:jsx.jsxs('div', {
      className:'odyssey-deliverable-cover', 'data-format':kind, children:[
        ppt ? photograph : jsx.jsx('div', {className:'odyssey-deliverable-crop',style:box(64,0,24,104),children:photograph}),
        ppt && jsx.jsx('span', {className:'odyssey-deliverable-blank',style:box(0,0,91.3,57.4)}),
        jsx.jsx('span', {className:'odyssey-deliverable-cyan',style:ppt?box(0,57.4,91.3,10.1):box(0,104,64,14)}),
        jsx.jsx('span', {className:'odyssey-deliverable-navy',style:ppt?box(91.3,57.4,28.7,10.1):box(64,104,24,14)}),
        ...bars.map((rectangle,index)=>jsx.jsx('span', {className:'odyssey-deliverable-skeleton',style:box(...rectangle)},index)),
        jsx.jsx('img', {className:'odyssey-deliverable-logo',src:assets.logo,alt:'',draggable:false,style:ppt?box(95.9,60.333225,19.5,4.233552):box(66.75,108.991775,18.5,4.016448)})
      ]
    })})
  })
}

const startMarker = '/* sherlock:composer-deliverable-preview:v1:start */'
const endMarker = '/* sherlock:composer-deliverable-preview:v1:end */'
const inputMarker = '/* sherlock:composer-deliverable-preview:input:v1 */'

function replaceOne(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw Error('Composer deliverable preview anchor drifted: ' + anchor.slice(0,100))
  return source.replace(anchor, replacement)
}

export function patchComposerDeliverablePreview(source) {
  const assets = Object.fromEntries(['template','logo'].map(name => [name, 'data:image/png;base64,' + readFileSync(new URL(`../../src/preload/input-deliverable-assets/efund-${name}.png`, import.meta.url)).toString('base64')]))
  const block = `${startMarker}\nconst composerDeliverableAssets = ${JSON.stringify(assets)};\n${composerDeliverableKind.toString()}\n${renderComposerDeliverablePreview.toString()}\n${endMarker}\n`
  if (source.includes(startMarker)) {
    if (source.split(startMarker).length !== 2 || source.split(endMarker).length !== 2 || source.split(inputMarker).length !== 2 ||
        source.split('"data-odyssey-deliverable-preview": deliverablePreviewKind,').length !== 2 ||
        source.split('const deliverablePreviewKind = composerDeliverableKind(draft, input?.occurrences ?? []);').length !== 2 ||
        source.split('renderComposerDeliverablePreview(react_jsx_runtime, deliverablePreviewKind, composerDeliverableAssets),').length !== 2)
      throw Error('Composer deliverable preview installed patch drifted')
    const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start) + endMarker.length
    return source.slice(0,start) + block.trimEnd() + source.slice(end)
  }
  if (source.includes(endMarker)) throw Error('Composer deliverable preview installed patch drifted')
  const start = source.search(/^[\t ]*function InputBar\(\{/m), end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < 0) throw Error('Composer deliverable preview InputBar boundary drifted')
  let input = source.slice(start,end)
  const draft = 'const draft = input?.draft ?? "";'
  const root = 'className: clsx(InputBar_module_css_default.root, variant === "hero" && InputBar_module_css_default.hero),'
  const scroll = '\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\t\t\tref: scrollRef,'
  const call = 'const deliverablePreviewKind = composerDeliverableKind(draft, input?.occurrences ?? []);'
  const attribute = '"data-odyssey-deliverable-preview": deliverablePreviewKind,'
  const render = 'renderComposerDeliverablePreview(react_jsx_runtime, deliverablePreviewKind, composerDeliverableAssets),'
  const insertions = [[draft,`${draft}\n${inputMarker}\n${call}`],[root,`${root}\n${attribute}`],[scroll,render+'\n'+scroll]]
  if ([inputMarker,call,attribute,render].some(value=>source.includes(value))) {
    // Legacy grid/notes restorers can replace the range before InputBar while
    // keeping its augmented body. Repair only that exact, complete orphan.
    const markers = [inputMarker,call,attribute,render]
    if ((source.match(/^[\t ]*function InputBar\(\{/gm)??[]).length!==1 ||
        markers.some(value=>source.split(value).length!==2||input.split(value).length!==2) ||
        ['function composerDeliverableKind(', 'function renderComposerDeliverablePreview(', 'const composerDeliverableAssets ='].some(value=>source.includes(value)) ||
        ['composerDeliverableKind','renderComposerDeliverablePreview','composerDeliverableAssets'].some(name=>(source.match(new RegExp('\\b'+name+'\\b','g'))??[]).length!==1))
      throw Error('Composer deliverable preview installed patch drifted')
    let native = input
    for (const [anchor,installed] of insertions) {
      if (native.split(installed).length!==2) throw Error('Composer deliverable preview installed patch drifted')
      native = native.replace(installed,anchor)
    }
    let verified = native
    for (const [anchor,installed] of insertions) {
      if (verified.split(anchor).length!==2) throw Error('Composer deliverable preview installed patch drifted')
      verified = verified.replace(anchor,installed)
    }
    if (verified!==input) throw Error('Composer deliverable preview installed patch drifted')
    return source.slice(0,start) + block + input + source.slice(end)
  }
  if (['function composerDeliverableKind(', 'function renderComposerDeliverablePreview(', 'const composerDeliverableAssets ='].some(value=>source.includes(value)))
    throw Error('Composer deliverable preview installed patch drifted')
  for (const [anchor,installed] of insertions) input = replaceOne(input,anchor,installed)
  return source.slice(0,start) + block + input + source.slice(end)
}
