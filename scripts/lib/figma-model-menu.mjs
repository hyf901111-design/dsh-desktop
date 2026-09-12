/** 665:857 / 12A: searchable model directory; keep the Host-owned selection API. */
export function patchFigmaModelMenu(source) {
  const marker = '/* odyssey:searchable-model-menu:20260912 */'
  if (source.includes(marker)) return patchPaneFocus(source)
  const exact = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Model menu anchor drifted: '+before.slice(0,80))
    source = source.replace(before,after)
  }
  exact('let react = require("react");', 'let react = require("react");\n\t\tlet odysseyReactDOM = require("react-dom");\n'+marker)
  exact('const [pane, setPane] = (0, react.useState)("root");', `const [pane, setPane] = (0, react.useState)("model");
      const [query, setQuery] = (0, react.useState)("");
      const [menuPosition, setMenuPosition] = (0, react.useState)({});
      const menuRef = (0, react.useRef)(null);
      const searchRef = (0, react.useRef)(null);
      const chinese = t("menu.model") === "模型";
      const menuText = (zh, en) => chinese ? zh : en;
      const needle = query.trim().toLocaleLowerCase();
      const visibleGroups = state.groups.map(group => ({...group, models: group.models.filter(model =>
        [group.id,group.name,model.id,model.name,model.description].some(value => String(value ?? "").toLocaleLowerCase().includes(needle))
      )})).filter(group => group.models.length > 0);`)
  exact('if (!rootRef.current?.contains(event.target)) setOpen(false);', 'if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);')
  exact('if (!available) return null;', `(0, react.useLayoutEffect)(() => {
        if (!open) return;
        const place = () => {
          const anchor = triggerRef.current?.getBoundingClientRect();
          if (!anchor) return;
          const width = Math.min(320,window.innerWidth-24);
          const height = Math.min(menuRef.current?.scrollHeight || 240,480);
          const below = window.innerHeight-anchor.bottom-20;
          const above = anchor.top-20;
          const upwards = below < height && above > below;
          setMenuPosition({left:Math.max(12,Math.min(anchor.right-width,window.innerWidth-width-12)),
            width, top:upwards ? 'auto' : anchor.bottom+8,
            bottom:upwards ? window.innerHeight-anchor.top+8 : 'auto',
            maxHeight:Math.max(0,upwards ? above : below)});
        };
        place();
        window.addEventListener('resize',place);
        return () => window.removeEventListener('resize',place);
      },[open,pane,query,state.groups]);
      if (!available) return null;`)
  exact('setPane("root");\n\t\t\t\tsetOpen(true);', 'setPane("model");\n\t\t\t\tsetQuery("");\n\t\t\t\tsetOpen(true);')
  exact('setPane("root");\n\t\t\t\tif (restoreFocus)', 'setPane("model");\n\t\t\t\tif (restoreFocus)')
  exact('items[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();', 'items[(active < 0 ? (offset > 0 ? 0 : items.length-1) : (active+offset+items.length)%items.length)]?.focus();')
  exact('if (pane !== "root") setPane("root");\n\t\t\t\t\telse close(true);', 'event.stopPropagation();\n\t\t\t\t\tif (pane === "effort") { setPane("model"); queueMicrotask(() => menuRef.current?.querySelector("[data-model-effort]")?.focus()); }\n\t\t\t\t\telse close(true);')
  exact('if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;', 'if (event.relatedTarget instanceof Node && (rootRef.current?.contains(event.relatedTarget) || menuRef.current?.contains(event.relatedTarget))) return;')
  exact('const onBlur = (event) => {\n\t\t\t\tif (event.relatedTarget instanceof Node && (rootRef.current?.contains(event.relatedTarget) || menuRef.current?.contains(event.relatedTarget))) return;\n\t\t\t\tclose();\n\t\t\t};', `const onBlur = () => {
        // Portal children autofocus before the portal parent ref is attached.
        queueMicrotask(() => {
          if (!rootRef.current?.contains(document.activeElement) && !menuRef.current?.contains(document.activeElement)) close();
        });
      };`)
  const rootStart = source.indexOf('pane === "root" &&')
  const modelsStart = source.indexOf('pane === "model" &&',rootStart)
  if (rootStart < 0 || modelsStart < rootStart) throw Error('Model root pane missing')
  source = source.slice(0,rootStart)+source.slice(modelsStart)
  exact('pane === "model" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [', `pane === "model" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
        (0, react_jsx_runtime.jsx)("input", {type:"search",ref:searchRef,className:"odyssey-model-search",value:query,
          "aria-label":menuText("搜索模型","Search models"),placeholder:menuText("搜索模型…","Search models…"),
          onInput:event=>setQuery(event.currentTarget.value),autoFocus:true}),`)
  exact('children: state.groups.map((group) => {','children: visibleGroups.map((group) => {')
  exact('state.status === "ready" && choices.length === 0', 'state.status === "ready" && visibleGroups.length === 0')
  exact('children: t("empty.models")','children: needle ? menuText("没有匹配的模型","No matching models") : t("empty.models")')
  exact('pane === "effort" && (0, react_jsx_runtime.jsxs)', `(pane === "model") && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {children:[
        reasoning !== void 0 && (0, react_jsx_runtime.jsxs)("button", {type:"button",role:"menuitem",ref:itemRef(),"data-model-effort":"",className:"odyssey-model-footer",
          onClick:()=>{setPane("effort");queueMicrotask(()=>itemRefs.current[0]?.focus());},
          children:[(0, react_jsx_runtime.jsx)("span",{children:menuText("推理强度","Reasoning effort")}),
            (0, react_jsx_runtime.jsx)("small",{children:effortLabel}),
            (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14,{})]}),
        (0, react_jsx_runtime.jsx)("button", {type:"button",role:"menuitem",ref:itemRef(),className:"odyssey-model-footer",onClick:()=>{
          close();window.dispatchEvent(new CustomEvent("sherlock:model-settings-open"));
        },children:menuText("管理模型…","Manage models…")})]}),
      pane === "effort" && (0, react_jsx_runtime.jsxs)`)
  exact('open && (0, react_jsx_runtime.jsxs)("div", {','open && odysseyReactDOM.createPortal((0, react_jsx_runtime.jsxs)("div", {')
  exact('className: ModelSelect_module_css_default.menu,','className: ModelSelect_module_css_default.menu + " odyssey-model-menu",ref:menuRef,style:menuPosition,')
  exact('}),\n\t\t\t\t\ttoast !== null', '}), document.body),\n\t\t\t\t\ttoast !== null')
  return patchPaneFocus(source)
}

function patchPaneFocus(source) {
  const marker = '/* odyssey:model-pane-focus:20260912 */'
  if (source.includes(marker)) return source
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Model pane focus anchor drifted')
    source = source.replace(before, after)
  }
  replace('const searchRef = (0, react.useRef)(null);', `const searchRef = (0, react.useRef)(null);
      const returnToEffortRef = (0, react.useRef)(false);
      ${marker}
      (0, react.useLayoutEffect)(() => {
        if (!open) return;
        if (pane === 'effort') menuRef.current?.querySelector('[role=menuitemradio]')?.focus();
        else if (returnToEffortRef.current) {
          returnToEffortRef.current = false;
          menuRef.current?.querySelector('[data-model-effort]')?.focus();
        }
      }, [open, pane]);`)
  replace('setPane("model"); queueMicrotask(() => menuRef.current?.querySelector("[data-model-effort]")?.focus());', 'returnToEffortRef.current = true; setPane("model");')
  replace('setPane("effort");queueMicrotask(()=>itemRefs.current[0]?.focus());', 'setPane("effort");')
  return source
}
