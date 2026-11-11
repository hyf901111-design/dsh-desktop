/** Keep settings popovers inside the modal's accessibility and focus boundary. */
export function patchFigmaMenuScope(source, bundled = false) {
  const marker = '/* odyssey:menu-modal-scope:20260912 */'
  if (source.includes(marker)) return source
  const before = bundled ? 'ln.createPortal(J,document.body)' : 'createPortal(list, document.body)'
  const root = bundled ? 'T' : 'rootRef'
  const after = (bundled ? 'ln.createPortal(J,' : 'createPortal(list, ') + `(${root}.current?.closest('[aria-modal="true"]') ?? document.body))` + marker
  if (source.split(before).length !== 2) throw Error('Shared Menu portal anchor drifted')
  return source.replace(before, after)
}

/** Identify portaled hover cards for the native browser overlay. */
export function patchBrowserHoverCard(source, bundled = false) {
  const attribute = '"data-odyssey-hover-card":""'
  if (source.includes(attribute)) return source
  const anchor = bundled
    ? 'f.jsx("div",{ref:g,className:`${xr.card}'
    : 'const card = open && pos !== null && jsx("div", {\n\t\tref: cardRef,'
  if (source.split(anchor).length !== 2) throw Error('Shared HoverCard portal anchor drifted')
  const patched = bundled
    ? anchor.replace('ref:g,', 'ref:g,' + attribute + ',')
    : anchor + '\n\t\t' + attribute + ','
  return source.replace(anchor, patched)
}

export function patchFigmaSettingsModeDescription(source) {
  const marker = '/* odyssey:settings-mode-description:20260912 */'
  if (source.includes(marker)) return source
  const before = 'label: (0, react_jsx_runtime.jsxs)("span", { className: "sherlock-settings-preset-option", children: [(0, react_jsx_runtime.jsx)(ModeIcon, { id: option.id, size: 16 }), option.trust === "user" ? `${name} · ${t("userTrust")}` : name] })'
  const after = `label: (0, react_jsx_runtime.jsxs)("span", {className: 'cubgiG_item' + (option.id === selectedId ? ' cubgiG_selectedItem' : ''), children:[
    (0, react_jsx_runtime.jsxs)('span', {className:'cubgiG_itemName',children:[(0, react_jsx_runtime.jsx)(ModeIcon,{id:option.id,size:16}),option.trust === 'user' ? name + ' · ' + t('userTrust') : name]}),
    (0, react_jsx_runtime.jsx)('span', {className:'cubgiG_itemDesc',children:presetDisplayText(option,t).description ?? t('noDescription')})
  ]})${marker}`
  if (source.split(before).length !== 2) throw Error('Settings mode description anchor drifted')
  return source.replace(before, after)
}

export function patchFigmaEnterDescription(source) {
  const marker='/* odyssey:busy-enter-description:20260912 */'
  if(source.includes(marker))return source
  const start=source.indexOf('function EnterBehaviorRow('),end=source.indexOf('\n\t\t//#endregion',start)
  if(start<0||end<start)throw Error('Enter settings boundary drifted')
  let part=source.slice(start,end)
  const before='label: t(option.label)'
  if(part.split(before).length!==2)throw Error('Enter label anchor drifted')
  part=part.replace(before,`label: (0,react_jsx_runtime.jsxs)('span',{className:'odyssey-permission-item odyssey-enter-item',children:[
    (0,react_jsx_runtime.jsx)('span',{className:'odyssey-permission-name',children:t(option.label)}),
    (0,react_jsx_runtime.jsx)('span',{className:'odyssey-permission-description',children:t('settings.enter.queue')==='排队发送' ? (option.id==='queue'?'当前任务完成后再处理新消息。':'在运行中的任务中补充指令。') : (option.id==='queue'?'Process the message after the current task finishes.':'Add instructions to the running task.')})
  ]})${marker}`)
  return source.slice(0,start)+part+source.slice(end)
}
