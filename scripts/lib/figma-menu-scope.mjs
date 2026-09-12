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
