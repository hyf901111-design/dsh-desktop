import { readFileSync } from 'node:fs'

// Restore the shipped ModelSelect UI. Directory and Host retain selection ownership.
const original = readFileSync(new URL('./model-select-restored.txt', import.meta.url), 'utf8')
export function patchFigmaModelMenu(source) {
  const start = source.indexOf('function ModelSelect(')
  const end = source.indexOf('\n\t\t//#endregion', start)
  if (start < 0 || end < start) throw Error('ModelSelect boundary drifted')
  let restored = original
    .replace('const choices = (0, react.useMemo)(() => state.groups.flatMap', `const [hostedAccount, setHostedAccount] = (0, react.useState)(() => document.documentElement.hasAttribute('data-odyssey-hosted-account'));
      (0, react.useEffect)(() => {
        const root = document.documentElement;
        const sync = () => setHostedAccount(root.hasAttribute('data-odyssey-hosted-account'));
        const observer = new document.defaultView.MutationObserver(sync);
        observer.observe(root, {attributes:true, attributeFilter:['data-odyssey-hosted-account']});
        sync();
        return () => observer.disconnect();
      }, []);
      const groups = (0, react.useMemo)(() => hostedAccount ? state.groups : state.groups.filter(group => group.id !== 'ework-ark'), [state.groups, hostedAccount]);
      const choices = (0, react.useMemo)(() => groups.flatMap`)
    .replace('}))), [state.groups]);', '}))), [groups]);')
    .replace('children: state.groups.map((group)', 'children: groups.map((group)')
    .replace('const id = (0, react.useId)();', `const id = (0, react.useId)();
      const menuRef = (0, react.useRef)(null);
      const [position, setPosition] = (0, react.useState)({});
      (0, react.useLayoutEffect)(() => {
        if (!open) return;
        const place = () => {
          const a = triggerRef.current?.getBoundingClientRect();
          if (!a) return;
          const pane = triggerRef.current?.closest('.t8lSSG_panel')?.getBoundingClientRect();
          const left = pane?.width ? Math.max(12,pane.left+12) : 12, right = pane?.width ? Math.min(window.innerWidth-12,pane.right-12) : window.innerWidth-12;
          const width = Math.min(320, Math.max(0,right-left));
          const above = a.top - 20, below = window.innerHeight - a.bottom - 20;
          const up = above >= below;
          setPosition({position:'fixed', width, left:Math.max(left,Math.min(a.right-width,right-width)),right:'auto',
            top:up?'auto':a.bottom+8,bottom:up?window.innerHeight-a.top+8:'auto',maxHeight:Math.min(480,Math.max(0,up?above:below))});
        };
        place(); window.addEventListener('resize',place);
        const observer = typeof ResizeObserver==='function' ? new ResizeObserver(place) : null;
        if(triggerRef.current)observer?.observe(triggerRef.current);const paneElement=triggerRef.current?.closest('.t8lSSG_panel');if(paneElement)observer?.observe(paneElement);
        return () => {window.removeEventListener('resize',place);observer?.disconnect()};
      }, [open,pane]);`)
    .replace('if (!rootRef.current?.contains(event.target)) setOpen(false);', 'if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);')
    .replace('if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;',
      'if (!(event.relatedTarget instanceof Node) || rootRef.current?.contains(event.relatedTarget) || menuRef.current?.contains(event.relatedTarget)) return;')
    .replace('open && (0, react_jsx_runtime.jsxs)("div", {', 'open && odysseyReactDOM.createPortal((0, react_jsx_runtime.jsxs)("div", {')
    .replace('className: ModelSelect_module_css_default.menu,', `className: ModelSelect_module_css_default.menu + ' odyssey-restored-model-menu', ref:menuRef, style:position,
      onMouseDown:event=>event.preventDefault(),`)
    .replace('}),\n\t\t\t\t\ttoast !== null', '}), document.body),\n\t\t\t\t\ttoast !== null')
    .replace('items[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();', 'items[(active < 0 ? (offset > 0 ? 0 : items.length-1) : (active+offset+items.length)%items.length)]?.focus({preventScroll:true});')
    .replace('if (pane !== "root") setPane("root");', 'event.stopPropagation(); if (pane !== "root") setPane("root");')
    .replaceAll('triggerRef.current?.focus();', 'triggerRef.current?.focus({preventScroll:true});')
  if (!source.includes('let odysseyReactDOM = require("react-dom");')) source = source.replace('let react = require("react");', 'let react = require("react");\nlet odysseyReactDOM = require("react-dom");')
  const freshStart = source.indexOf('function ModelSelect('), freshEnd = source.indexOf('\n\t\t//#endregion',freshStart)
  source=source.slice(0,freshStart)+restored+source.slice(freshEnd)
  const anchor='const directory = models.directoryFor(sessionId);',patched=`if(sessionId===undefined){const model=window[Symbol.for('sherlock:pending-conversation')]?.preferences.model;if(!model)throw Error('新对话模型尚未就绪');return {available:true,directory:model.store,load:()=>model.load().catch(()=>{}),select:selection=>model.select(selection).then(()=>true,()=>false)}}\n                        `+anchor;
  if(!source.includes("新对话模型尚未就绪")){const start=source.indexOf('name: "conversation.input.model"'),at=source.indexOf(anchor,start);if(start<0||at<0)throw Error('Pending model injection anchor drift');source=source.slice(0,at)+patched+source.slice(at+anchor.length)}
  return source
}
