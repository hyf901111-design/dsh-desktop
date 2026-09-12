// Figma 350:663/783 and 350:694/814. Business callbacks stay in ResearchCanvas.
export function researchDerivedFloatingPlacement({ trigger, popup, bounds, parent }) {
  const inset = 8, gap = 8;
  const maxWidth = Math.max(0, bounds.right - bounds.left - inset * 2);
  const width = Math.min(popup.width, maxWidth);
  const below = Math.max(0, bounds.bottom - inset - trigger.bottom - gap);
  const above = Math.max(0, trigger.top - gap - bounds.top - inset);
  const side = popup.height <= below || below >= above ? 'below' : 'above';
  const maxHeight = side === 'below' ? below : above;
  const left = Math.max(bounds.left + inset, Math.min(trigger.left, bounds.right - inset - width));
  const top = side === 'below' ? trigger.bottom + gap : trigger.top - gap - Math.min(popup.height, maxHeight);
  return { left: left - parent.left, top: top - parent.top, maxWidth, maxHeight, side };
}
function researchDerivedIsComposing(event) {
  return event.isComposing === true || event.nativeEvent?.isComposing === true || event.keyCode === 229 || event.nativeEvent?.keyCode === 229 || event.target?.dataset?.researchComposing === 'true';
}
function useResearchDerivedFloating({ popupRef, rootRef, triggerRef, anchorRef, canvasSize }) {
  const [placement, setPlacement] = (0, react.useState)({ visibility: 'hidden', left: 0, top: 0 });
  const measure = (0, react.useCallback)(() => {
    const popup = popupRef.current, root = rootRef.current;
    const trigger = triggerRef?.current ?? anchorRef?.current?.querySelector('button[aria-label="思维导图"]');
    if (!popup || !root || !trigger) return;
    const view = root.ownerDocument.defaultView, rootBounds = root.getBoundingClientRect();
    if (rootBounds.width <= 0 || rootBounds.height <= 0) return;
    const parent = popup.offsetParent ?? anchorRef?.current ?? root;
    const parentBounds = parent.getBoundingClientRect(), triggerBounds = trigger.getBoundingClientRect(), popupBounds = popup.getBoundingClientRect();
    const availableWidth = Math.max(0, Math.min(rootBounds.width, canvasSize.availableWidth ?? canvasSize.width));
    const bounds = { left: Math.max(0, rootBounds.left), top: Math.max(0, rootBounds.top), right: Math.min(view?.innerWidth ?? Infinity, rootBounds.left + availableWidth), bottom: Math.min(view?.innerHeight ?? Infinity, rootBounds.bottom) };
    const next = researchDerivedFloatingPlacement({ trigger: triggerBounds, popup: { width: popupBounds.width, height: Math.max(popupBounds.height, popup.scrollHeight) }, bounds, parent: { left: parentBounds.left + parent.clientLeft, top: parentBounds.top + parent.clientTop } });
    const style = { position: 'absolute', left: next.left, top: next.top, bottom: 'auto', maxWidth: next.maxWidth, maxHeight: next.maxHeight, visibility: 'visible' };
    setPlacement(previous => Object.keys(style).every(key => previous[key] === style[key]) ? previous : style);
  }, [popupRef, rootRef, triggerRef, anchorRef, canvasSize.width, canvasSize.availableWidth, canvasSize.height]);
  // Layout can change when selection, prompt errors, or the right panel changes.
  (0, react.useLayoutEffect)(measure);
  // A parent canvas ref is attached after a child's first layout effect.
  (0, react.useEffect)(measure, [measure]);
  (0, react.useEffect)(() => {
    const root = rootRef.current, view = root?.ownerDocument.defaultView;
    if (!root || !view) return;
    const observer = view.ResizeObserver ? new view.ResizeObserver(measure) : null;
    for (const element of [root, popupRef.current, triggerRef?.current ?? anchorRef?.current]) if (element) observer?.observe(element);
    view.addEventListener('resize', measure); root.ownerDocument.addEventListener('scroll', measure, true);
    return () => { observer?.disconnect(); view.removeEventListener('resize', measure); root.ownerDocument.removeEventListener('scroll', measure, true); };
  }, [measure, popupRef, rootRef, triggerRef, anchorRef]);
  return placement;
}
function ResearchDerivedDetailMenu({ rootRef, anchorRef, canvasSize, onSelect, onClose, options }) {
  const popupRef = (0, react.useRef)(null);
  const style = useResearchDerivedFloating({ popupRef, rootRef, anchorRef, canvasSize });
  (0, react.useEffect)(() => {
    const doc = popupRef.current?.ownerDocument;
    if (!doc) return;
    const outside = event => { if (!popupRef.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) onClose(); };
    const escape = event => { if (event.key === 'Escape' && !researchDerivedIsComposing(event)) { event.preventDefault(); event.stopPropagation(); onClose(); } };
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', escape, true);
    return () => { doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', escape, true); };
  }, [anchorRef, onClose]);
  return (0, react_jsx_runtime.jsx)('div', { ref: popupRef, className: 'rScV5Q_mindMapMenu odyssey-derived-detail-menu', 'data-research-mind-map-menu': '', role: 'menu', 'aria-label': '思维导图详细度', style,
    children: options.map(option => (0, react_jsx_runtime.jsxs)('button', { type: 'button', role: 'menuitemradio', 'aria-checked': option.value === 'standard', 'data-research-mind-map-detail': option.value,
      onClick: () => { onClose(); onSelect(option.value); }, children: [(0, react_jsx_runtime.jsxs)('div', { className: 'odyssey-derived-detail-copy', children: [(0, react_jsx_runtime.jsx)('strong', { children: option.label }), (0, react_jsx_runtime.jsx)('span', { children: option.description })] }), option.value === 'standard' ? (0, react_jsx_runtime.jsx)('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, className: 'odyssey-derived-detail-check', children: (0, react_jsx_runtime.jsx)('path', { d: 'M3.25 8.2 6.4 11.25 12.75 4.75', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }) }) : null] }, option.value)) });
}
function ResearchDerivedCreatePopover({ popoverRef, inputRef, triggerRef, rootRef, canvasSize, selection, prompt, error, preparing, disabled, maxPrompt, maxSources, onPrompt, onClose, onSubmit }) {
  const style = useResearchDerivedFloating({ popupRef: popoverRef, rootRef, triggerRef, canvasSize });
  const submitDisabled = preparing || !prompt.trim() || prompt.length > maxPrompt || selection.ids.length > maxSources || disabled;
  return (0, react_jsx_runtime.jsxs)('div', { ref: popoverRef, role: 'dialog', 'aria-label': '基于所选创建', 'data-research-create-popover': '', className: 'odyssey-derived-create-popover', style,
    onPointerDown: event => { event.stopPropagation(); if (!event.target?.closest?.('textarea,button')) event.preventDefault(); },
    onKeyDown: event => { event.stopPropagation(); if (researchDerivedIsComposing(event) || event.repeat) return; if (event.key === 'Escape') { event.preventDefault(); onClose(); } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (!submitDisabled) void onSubmit(); } },
    children: [(0, react_jsx_runtime.jsxs)('div', { className: 'odyssey-create-heading', children: [(0, react_jsx_runtime.jsx)('strong', { children: '基于所选创建' }), (0, react_jsx_runtime.jsx)('button', { type: 'button', onClick: onClose, children: 'Esc 关闭' })] }),
      (0, react_jsx_runtime.jsx)('p', { className: 'odyssey-create-count', children: '已选择 ' + selection.ids.length + ' 个组件' }),
      (0, react_jsx_runtime.jsx)('textarea', { ref: inputRef, 'aria-label': '创建需求', value: prompt, maxLength: maxPrompt, rows: 4, disabled: preparing, placeholder: '想基于这些资料创建什么？', onInput: event => onPrompt(event.currentTarget.value), onChange: event => onPrompt(event.currentTarget.value), onCompositionStart: event => { event.currentTarget.dataset.researchComposing = 'true'; }, onCompositionEnd: event => { delete event.currentTarget.dataset.researchComposing; } }),
      error ? (0, react_jsx_runtime.jsx)('div', { role: 'alert', className: 'odyssey-create-error', children: error }) : null,
      (0, react_jsx_runtime.jsxs)('div', { className: 'odyssey-derived-create-footer', children: [(0, react_jsx_runtime.jsx)('span', { 'data-research-create-shortcut': '', children: '⌘ Enter 创建' }), (0, react_jsx_runtime.jsx)('button', { type: 'button', title: '⌘ Enter 创建', 'data-research-create-submit': '', onClick: onSubmit, disabled: submitDisabled, children: preparing ? '正在读取…' : '创建' })] })] });
}
const startMarker = '/* SHERLOCK_FIGMA_DERIVED_MENU_START */';
const endMarker = '/* SHERLOCK_FIGMA_DERIVED_MENU_END */';
const definitions = [researchDerivedFloatingPlacement, researchDerivedIsComposing, useResearchDerivedFloating, ResearchDerivedDetailMenu, ResearchDerivedCreatePopover].map(fn => fn.toString()).join('\n');
const menuCall = '!mindMapMenuOpen ? null : (0, react_jsx_runtime.jsx)(ResearchDerivedDetailMenu, { rootRef, anchorRef: selectionToolbarRef, canvasSize: snapshot.canvasSize, onSelect: detail => startSelectionGeneration("mind-map", detail), onClose: () => setMindMapMenuOpen(false), options: RESEARCH_MIND_MAP_DETAIL_OPTIONS })';
const createCall = 'createSelection === null ? null : (0, react_jsx_runtime.jsx)(ResearchDerivedCreatePopover, { popoverRef: createPopoverRef, inputRef: createInputRef, triggerRef: createTriggerRef, rootRef, canvasSize: snapshot.canvasSize, selection: createSelection, prompt: createPrompt, error: createError, preparing: createPreparing, disabled: selectionGeneration?.disabled === true, maxPrompt: RESEARCH_CONTAINER_MAX_PROMPT, maxSources: RESEARCH_GENERATION_MAX_SOURCES, onPrompt: setCreatePrompt, onClose: closeSelectedCreate, onSubmit: startSelectedCreate })';
const guardedEscape = "const escape = (event) => { if (event.key === 'Escape' && !researchDerivedIsComposing(event)) { event.preventDefault(); closeSelectedCreate(); } };";
function requireUnique(source, anchor) {
  const start = source.indexOf(anchor);
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) throw Error('Figma derived menu anchor missing or ambiguous: ' + anchor.slice(0, 80));
  return start;
}
export function patchFigmaDerivedMenu(source) {
  if (source.includes(startMarker)) {
    requireUnique(source, startMarker + '\n' + definitions + '\n' + endMarker);
    for (const call of [menuCall, createCall, guardedEscape]) requireUnique(source, call);
    return source;
  }
  const menuStart = requireUnique(source, '!mindMapMenuOpen ? null : (0, react_jsx_runtime.jsx)("div", {');
  const menuEnd = source.indexOf('\n\t\t\t\t}), createSelection === null', menuStart);
  const oldMenu = source.slice(menuStart, menuEnd);
  if (menuEnd < 0 || !oldMenu.includes('className: "rScV5Q_mindMapMenu"') || !oldMenu.includes("startSelectionGeneration('mind-map', option.value)")) throw Error('Figma derived menu renderer contract changed');
  source = source.slice(0, menuStart) + menuCall + ']' + source.slice(menuEnd);
  const createStart = requireUnique(source, "createSelection === null ? null : (0, react_jsx_runtime.jsxs)('div', {");
  const createEnd = source.indexOf(', marquee === null', createStart), oldCreate = source.slice(createStart, createEnd);
  if (createEnd < 0 || !oldCreate.includes("'data-research-create-submit'") || !oldCreate.includes('onClick: startSelectedCreate') || !oldCreate.includes("'aria-label': '创建需求'")) throw Error('Figma derived menu create contract changed');
  source = source.slice(0, createStart) + createCall + source.slice(createEnd);
  const escape = "const escape = (event) => { if (event.key === 'Escape') { event.preventDefault(); closeSelectedCreate(); } };";
  requireUnique(source, escape); source = source.replace(escape, guardedEscape);
  const anchor = 'function researchCanvasDotMetrics('; requireUnique(source, anchor);
  return source.replace(anchor, startMarker + '\n' + definitions + '\n' + endMarker + '\n' + anchor);
}

export const derivedMenuCss = `
.odyssey-derived-detail-menu,.odyssey-derived-create-popover{--odyssey-derived-surface:#fff;--odyssey-derived-border:#e7e8ec;--odyssey-derived-input:#f4f5f7;--odyssey-derived-text:#242529;--odyssey-derived-muted:#85878d;--odyssey-derived-focus:#4279d8;--odyssey-derived-button:#242529;--odyssey-derived-button-text:#fff;--odyssey-derived-shadow:0 4px 16px rgba(0,0,0,.055)}
body[data-ds-dark-theme] :is(.odyssey-derived-detail-menu,.odyssey-derived-create-popover){--odyssey-derived-surface:#292a2d;--odyssey-derived-border:#414247;--odyssey-derived-input:#343538;--odyssey-derived-text:#ececed;--odyssey-derived-muted:#98999f;--odyssey-derived-focus:#92b5fa;--odyssey-derived-button:#ececed;--odyssey-derived-button-text:#292a2d;--odyssey-derived-shadow:0 4px 16px rgba(0,0,0,.16)}
.rScV5Q_mindMapMenu.odyssey-derived-detail-menu,[data-research-create-popover].odyssey-derived-create-popover{box-sizing:border-box;border:0!important;outline:1px solid var(--odyssey-derived-border);outline-offset:-1px;background:var(--odyssey-derived-surface)!important;color:var(--odyssey-derived-text);box-shadow:var(--odyssey-derived-shadow)!important;backdrop-filter:none;overflow:auto;z-index:45}
.rScV5Q_mindMapMenu.odyssey-derived-detail-menu{width:280px!important;padding:6px!important;gap:2px;border-radius:10px;display:flex;flex-direction:column}
.rScV5Q_mindMapMenu.odyssey-derived-detail-menu button{box-sizing:border-box;display:flex;flex-direction:row;align-items:center;justify-content:flex-start;width:100%;min-width:0;height:64px!important;min-height:64px;flex:none;padding:7px 10px 17px!important;gap:10px;border:0;border-radius:6px;background:transparent;color:var(--odyssey-derived-text);text-align:left}
.rScV5Q_mindMapMenu.odyssey-derived-detail-menu button:is([aria-checked=true],:hover,:focus-visible){background:var(--odyssey-derived-input)}
.odyssey-derived-detail-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.rScV5Q_mindMapMenu.odyssey-derived-detail-menu strong{font:400 13px/20px 'Noto Sans SC',sans-serif;letter-spacing:0}.rScV5Q_mindMapMenu.odyssey-derived-detail-menu span{font:400 11px/18px 'Noto Sans SC',sans-serif;color:var(--odyssey-derived-muted);letter-spacing:0}
.rScV5Q_mindMapMenu.odyssey-derived-detail-menu .odyssey-derived-detail-check{width:14px;height:14px;flex:none;align-self:flex-start;margin-top:3px;color:var(--odyssey-derived-text)}
[data-research-create-popover].odyssey-derived-create-popover{display:flex;flex-direction:column;align-items:stretch;width:420px!important;padding:22px!important;gap:12px;border-radius:12px!important;font:400 13px/21px 'Noto Sans SC',sans-serif;letter-spacing:0}
.odyssey-derived-create-popover .odyssey-create-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:23px;flex:none;font:400 15px/23px 'Noto Sans SC',sans-serif}.odyssey-derived-create-popover .odyssey-create-heading strong{font:500 15px/23px 'Noto Sans SC',sans-serif}.odyssey-derived-create-popover .odyssey-create-heading button{flex:none;padding:0;border:0;background:transparent;color:var(--odyssey-derived-muted);font:400 12px/20px 'Noto Sans SC',sans-serif}
.odyssey-derived-create-popover .odyssey-create-count{flex:none;margin:0;min-height:20px;font:400 12px/20px 'Noto Sans SC',sans-serif;color:var(--odyssey-derived-muted)}
[data-research-create-popover].odyssey-derived-create-popover textarea{box-sizing:border-box;display:block;width:100%;min-width:0;height:110px!important;min-height:110px;flex:none;padding:10px 12px;resize:none!important;border:0;border-radius:8px;background:var(--odyssey-derived-input);color:var(--odyssey-derived-text);outline:1px solid var(--odyssey-derived-border);outline-offset:-1px;box-shadow:none;font:400 13px/21px 'Noto Sans SC',sans-serif!important;letter-spacing:0}
[data-research-create-popover].odyssey-derived-create-popover textarea:focus{outline-color:var(--odyssey-derived-focus)}
.odyssey-derived-create-footer{display:flex;align-items:center;gap:8px;min-height:28px;flex:none}.odyssey-derived-create-footer [data-research-create-shortcut]{margin-right:auto;font:400 11px/19px 'Noto Sans SC',sans-serif;color:var(--odyssey-derived-muted)}
.odyssey-derived-create-footer [data-research-create-submit]{box-sizing:border-box;min-width:48px;height:28px;padding:4px 12px;border:0;border-radius:6px;background:var(--odyssey-derived-button);color:var(--odyssey-derived-button-text);font:400 12px/20px 'Noto Sans SC',sans-serif;white-space:nowrap}.odyssey-derived-create-footer [data-research-create-submit]:disabled{opacity:.4;cursor:default}.odyssey-create-error{flex:none;font:400 12px/20px 'Noto Sans SC',sans-serif;overflow-wrap:anywhere}
`;
