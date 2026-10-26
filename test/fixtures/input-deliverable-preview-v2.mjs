// Frozen production v2 installer from 7519b5ae016e5fde9c7c02a9b34672f16b066ce7.
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

/** Resolve the displayed occurrence, rather than all skills with the same id. */
export function composerDeliverableTarget(draft, occurrences) {
  let target
  for (const item of occurrences) {
    if (!Number.isSafeInteger(item.occurrenceId) || item.occurrenceId < 0 || item.source !== 'ework-managed-skill' || !Number.isSafeInteger(item.offset) || item.offset < 0 || draft[item.offset] !== '\uFFFC') continue
    try {
      const id = JSON.parse(item.ref)?.id
      const kind = id === 'builtin:efund-ppt-maker' ? 'ppt' : id === 'builtin:ework-equity-research' ? 'report' : undefined
      if (kind && (!target || item.offset >= target.offset)) target = {...item, kind}
    } catch { /* Only native built-in occurrences own covers. */ }
  }
  return target
}

/** The normal native delete journal, with a precise sidecar selection lease. */
export function useComposerDeliverablePreview(react, options) {
  const {keyboard, sessionId, inputRef, draft, draftRev, occurrences, locked, machineBusy, composingRef, remove, onSelected} = options
  const target = composerDeliverableTarget(draft, occurrences)
  const owner = react.useMemo(() => ({}), [keyboard, sessionId])
  const live = react.useRef(null), pending = react.useRef(null), alive = react.useRef(false)
  const [, restore] = react.useState(0)
  live.current = {owner, locked, machineBusy, composingRef}
  react.useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; pending.current = null } }, [owner])
  // Registered after the native reference projection's layout effect. Its old
  // numeric selection must not overwrite this transaction's mapped selection.
  react.useLayoutEffect(() => {
    const item = pending.current
    if (!item) return
    pending.current = null
    const after = keyboard?.snapshot, el = inputRef.current
    if (!alive.current || item.owner !== owner || el !== item.el || !el?.isConnected || after?.draftRev !== item.rev || after?.draft !== item.draft) return
    if (item.buttonFocused && !item.button.isConnected && el.ownerDocument.activeElement === el.ownerDocument.body) el.focus({preventScroll:true})
    el.setSelectionRange(item.start, item.end, item.direction)
    if (item.scroll?.isConnected) item.scroll.scrollTop = item.scrollTop
  })
  return {disabled:!target || locked || machineBusy || typeof remove !== 'function',
    remove(button) {
      const current = live.current, el = inputRef.current, snapshot = keyboard?.snapshot
      if (!alive.current || current?.owner !== owner || current.locked || current.machineBusy || current.composingRef.current || keyboard?.disposed || !target || !el?.isConnected || el.disabled || el.readOnly || !button?.isConnected || button.closest('.uV2eYG_root') !== el.closest('.uV2eYG_root')) return false
      if (snapshot?.draftRev !== draftRev || snapshot?.draft !== draft || snapshot.phase === 'adjudicating' || snapshot.phase === 'submitting' || snapshot.researchContextPreparing) return false
      const actual = composerDeliverableTarget(snapshot.draft, snapshot.occurrences)
      if (!actual || actual.occurrenceId !== target.occurrenceId || actual.offset !== target.offset || actual.ref !== target.ref || actual.source !== target.source) return false
      const at = actual.offset, map = value => value <= at ? value : value - 1
      const selection = {start:map(el.selectionStart), end:map(el.selectionEnd), direction:el.selectionDirection}
      const scroll = el.closest('[data-input-scroll]'), scrollTop = scroll?.scrollTop ?? 0, buttonFocused = el.ownerDocument.activeElement === button
      const binding = globalThis.window?.[Symbol.for('sherlock:pptx-annotation-input')]?.getShellBinding?.(keyboard)
      // A wide UI selection is not the deletion intent: otherwise an annotation
      // sidecar could legitimately expand it to include owned remarks.
      binding?.setSelection?.({start:at, end:at + 1})
      let caret
      try { caret = remove(keyboard, actual.occurrenceId) } finally { binding?.setSelection?.() }
      const after = keyboard.snapshot
      if (typeof caret !== 'number' || after.draft !== draft.slice(0, at) + draft.slice(at + 1)) return false
      pending.current = {owner, el, rev:after.draftRev, draft:after.draft, ...selection, button, buttonFocused, scroll, scrollTop}
      const selected = selection.end === selection.start + 1 && after.draft[selection.start] === '\uFFFC'
        ? after.occurrences.find(item => item.offset === selection.start)?.occurrenceId ?? null : null
      onSelected(selected)
      restore(value => value + 1)
      return true
    }
  }
}

/** Existing cover artwork plus the original 43B close-button assets. */
export function renderComposerDeliverablePreview(jsx, kind, assets, control) {
  if (!kind) return null
  const ppt = kind === 'ppt', width = ppt ? 120 : 88, height = ppt ? 67.5 : 118
  const box = (x, y, w, h) => ({left: `${x / width * 100}%`, top: `${y / height * 100}%`, width: `${w / width * 100}%`, height: `${h / height * 100}%`})
  const bars = ppt ? [[8,17,42,2.8],[8,23,30,1.7],[8,44,18,1.3],[8,49,28,1.3],[8,60.2,56,.9],[8,63.2,44,.9]]
    : [[8,20,40,2.8],[8,26,28,1.7],[8,42,18,1.4],[8,47,30,1.4],[8,78,40,1.4],[8,83,32,1.4],[8,88,24,1.4],[8,108.8,40,.9],[8,112.3,32,.9]]
  const photograph = jsx.jsx('img', {className:'odyssey-deliverable-template', src:assets.template, alt:'', draggable:false})
  return jsx.jsxs('div', {className:'odyssey-deliverable-preview', 'data-odyssey-deliverable-art':kind,
    children:[jsx.jsx('div', {className:'odyssey-deliverable-artboard', 'aria-hidden':true, children:jsx.jsxs('div', {
      className:'odyssey-deliverable-cover', 'data-format':kind, children:[
        ppt ? photograph : jsx.jsx('div', {className:'odyssey-deliverable-crop',style:box(64,0,24,104),children:photograph}),
        ppt && jsx.jsx('span', {className:'odyssey-deliverable-blank',style:box(0,0,91.3,57.4)}),
        jsx.jsx('span', {className:'odyssey-deliverable-cyan',style:ppt?box(0,57.4,91.3,10.1):box(0,104,64,14)}),
        jsx.jsx('span', {className:'odyssey-deliverable-navy',style:ppt?box(91.3,57.4,28.7,10.1):box(64,104,24,14)}),
        ...bars.map((rectangle,index)=>jsx.jsx('span', {className:'odyssey-deliverable-skeleton',style:box(...rectangle)},index)),
        jsx.jsx('img', {className:'odyssey-deliverable-logo',src:assets.logo,alt:'',draggable:false,style:ppt?box(95.9,60.333225,19.5,4.233552):box(66.75,108.991775,18.5,4.016448)})
      ]
    })}), control && jsx.jsxs('button', {type:'button', className:'odyssey-deliverable-close', disabled:control.disabled,
      'aria-label':globalThis.document?.documentElement.dataset.odysseyLocale === 'en' ? (ppt ? 'Remove presentation skill and preview' : 'Remove research-report skill and preview') : (ppt ? '移除 PPT 技能及配图' : '移除研报技能及配图'),
      onPointerDown:event=>{event.preventDefault();event.stopPropagation()},
      onClick:event=>{event.preventDefault();event.stopPropagation();control.remove(event.currentTarget)},
      children:[jsx.jsx('img',{src:assets.closeDefault,width:28,height:28,alt:'',draggable:false}),jsx.jsx('img',{className:'odyssey-deliverable-close-hover',src:assets.closeHover,width:28,height:28,alt:'',draggable:false})]
    })]
  })
}

const startMarker = '/* sherlock:composer-deliverable-preview:v2:start */'
const endMarker = '/* sherlock:composer-deliverable-preview:v2:end */'
const inputMarker = '/* sherlock:composer-deliverable-preview:input:v2 */'
const draftAnchor = 'const draft = input?.draft ?? "";'
const rootAnchor = 'className: clsx(InputBar_module_css_default.root, variant === "hero" && InputBar_module_css_default.hero),'
const scrollAnchor = '\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\t\t\tref: scrollRef,'
const busyAnchor = 'const machineBusy = input?.phase === "adjudicating" || input?.phase === "submitting" || input?.researchContextPreparing === true;'
const kindCall = 'const deliverablePreviewKind = composerDeliverableKind(draft, input?.occurrences ?? []);'
const attribute = '"data-odyssey-deliverable-preview": deliverablePreviewKind,'
const controlCall = 'const deliverablePreviewControl = useComposerDeliverablePreview(react, {keyboard, sessionId, inputRef, draft, draftRev: input?.draftRev, occurrences: input?.occurrences ?? [], locked, machineBusy, composingRef, remove: deleteInlineReferenceOccurrence, onSelected: setSelectedResearchOccurrenceId});'
const renderCall = 'renderComposerDeliverablePreview(react_jsx_runtime, deliverablePreviewKind, composerDeliverableAssets, deliverablePreviewControl),'
const legacyRender = 'renderComposerDeliverablePreview(react_jsx_runtime, deliverablePreviewKind, composerDeliverableAssets),'

function replaceOne(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw Error('Composer deliverable preview anchor drifted: ' + anchor.slice(0,100))
  return source.replace(anchor, replacement)
}
function insertions(version) {
  const marker = `/* sherlock:composer-deliverable-preview:input:v${version} */`
  return [[draftAnchor,`${draftAnchor}\n${marker}\n${kindCall}`],[rootAnchor,`${rootAnchor}\n${attribute}`],
    [scrollAnchor,(version===1?legacyRender:renderCall)+'\n'+scrollAnchor],
    ...(version===2?[[busyAnchor,`${busyAnchor}\n${controlCall}`]]:[])]
}

/** Both complete v1/v2 installs and the exact known grid/notes orphan are reversible. */
export function stripComposerDeliverablePreview(source) {
  const versions = [1,2].filter(version=>source.includes(`/* sherlock:composer-deliverable-preview:input:v${version} */`))
  const mentioned = /sherlock:composer-deliverable-preview|\bcomposerDeliverable(?:Kind|Target|Assets)\b|\b(?:render|use)ComposerDeliverablePreview\b/.test(source)
  if (!mentioned) return source
  const fail = () => { throw Error('Composer deliverable preview installed patch drifted') }
  if (versions.length!==1) return fail()
  const version=versions[0],begin=`/* sherlock:composer-deliverable-preview:v${version}:start */`,end=`/* sherlock:composer-deliverable-preview:v${version}:end */`
  const starts=source.split(begin).length-1,ends=source.split(end).length-1
  if(starts!==ends||starts>1) return fail()
  let body=source
  if(starts){
    const first=source.indexOf(begin),last=source.indexOf(end,first)
    if(last<first||source[last+end.length]!=='\n')return fail()
    body=source.slice(0,first)+source.slice(last+end.length+1)
  }
  // Nothing outside the owned InputBar seat may borrow these definitions/calls.
  const start=body.search(/^[\t ]*function InputBar\(\{/m),endInput=body.indexOf('\n\t\t//#endregion',start)
  if(start<0||endInput<0||(body.match(/^[\t ]*function InputBar\(\{/gm)??[]).length!==1)return fail()
  let input=body.slice(start,endInput)
  const fields=[`/* sherlock:composer-deliverable-preview:input:v${version} */`,kindCall,attribute,version===1?legacyRender:renderCall,...(version===2?[controlCall]:[])]
  if(fields.some(value=>body.split(value).length!==2||input.split(value).length!==2))return fail()
  if(['function composerDeliverableKind(', 'function composerDeliverableTarget(', 'function renderComposerDeliverablePreview(', 'function useComposerDeliverablePreview(', 'const composerDeliverableAssets ='].some(value=>body.includes(value)))return fail()
  for(const name of ['composerDeliverableKind','renderComposerDeliverablePreview','composerDeliverableAssets',...(version===2?['useComposerDeliverablePreview','deliverablePreviewControl']:[])]){
    const expected=name==='deliverablePreviewControl'?2:1
    if((body.match(new RegExp('\\b'+name+'\\b','g'))??[]).length!==expected)return fail()
  }
  const installed=input
  for(const [anchor,augmented]of insertions(version)){
    if(input.split(augmented).length!==2)return fail()
    input=input.replace(augmented,anchor)
  }
  let verified=input
  for(const [anchor,augmented]of insertions(version)){
    if(verified.split(anchor).length!==2)return fail()
    verified=verified.replace(anchor,augmented)
  }
  if(verified!==installed)return fail()
  const clean=body.slice(0,start)+input+body.slice(endInput)
  if(/sherlock:composer-deliverable-preview|\bcomposerDeliverable(?:Kind|Target|Assets)\b|\b(?:render|use)ComposerDeliverablePreview\b/.test(clean))return fail()
  return clean
}

export function patchComposerDeliverablePreview(source) {
  source=stripComposerDeliverablePreview(source)
  const assets = Object.fromEntries(['template','logo'].map(name => [name, 'data:image/png;base64,' + readFileSync(new URL(`../../src/preload/input-deliverable-assets/efund-${name}.png`, import.meta.url)).toString('base64')]))
  for(const [key,name]of [['closeDefault','skill-cover-close.svg'],['closeHover','skill-cover-close-hover.svg']])assets[key]='data:image/svg+xml;base64,'+readFileSync(new URL('../../src/preload/input-deliverable-assets/'+name,import.meta.url)).toString('base64')
  const block = `${startMarker}\nconst composerDeliverableAssets = ${JSON.stringify(assets)};\n${[composerDeliverableKind,composerDeliverableTarget,useComposerDeliverablePreview,renderComposerDeliverablePreview].map(fn=>fn.toString()).join('\n')}\n${endMarker}\n`
  const start=source.search(/^[\t ]*function InputBar\(\{/m),end=source.indexOf('\n\t\t//#endregion',start)
  if(start<0||end<0)throw Error('Composer deliverable preview InputBar boundary drifted')
  let input=source.slice(start,end)
  for(const [anchor,installed]of insertions(2))input=replaceOne(input,anchor,installed)
  return source.slice(0,start)+block+input+source.slice(end)
}
