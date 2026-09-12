/** 12C: compact More menu with a nested refresh picker; keep generation APIs. */
export function patchFigmaContainerMenu(source) {
  const marker='/* odyssey:container-refresh-submenu:20260912 */'
  if(source.includes(marker))return source
  const start=source.indexOf('function ResearchContainerMenu('),end=source.indexOf('\n\t\tfunction ResearchGeneratedContainer(',start)
  if(start<0||end<start)throw Error('Container menu boundary drifted')
  let part=source.slice(start,end)
  const exact=(before,after)=>{
    if(part.split(before).length!==2)throw Error('Container submenu anchor drifted: '+before.slice(0,90))
    part=part.replace(before,after)
  }
  exact('const rootRef = (0, react.useRef)(null);', `const rootRef = (0, react.useRef)(null);
    ${marker}
    const menuRef = (0,react.useRef)(null), submenuRef = (0,react.useRef)(null), refreshTriggerRef = (0,react.useRef)(null);
    const focusSubmenuRef = (0,react.useRef)(false);
    const [refreshOpen,setRefreshOpen] = (0,react.useState)(false);
    const [menuStyle,setMenuStyle] = (0,react.useState)({visibility:'hidden'});
    const [submenuStyle,setSubmenuStyle] = (0,react.useState)({});`)
  exact('const items = () => Array.from(rootRef.current?.querySelectorAll(\'[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)\') ?? []);', `const items = (target) => {
      const menu = target?.closest?.('[data-odyssey-refresh-options]') ?? menuRef.current;
      return Array.from(menu?.querySelectorAll('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)') ?? []).filter(item=>item.closest('[role="menu"]')===menu);
    };`)
  exact('setShowProvenance(false);','setShowProvenance(false); setRefreshOpen(false);')
  exact('if (!rootRef.current?.contains(event.target)) close(false);', 'if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) close(false);')
  exact('const choose = (action) => { close(); action?.(); };', `const choose = (action) => { close(); action?.(); };
    (0,react.useLayoutEffect)(()=>{
      if(!open||!present)return;
      const place=()=>{
        const r=triggerRef.current?.getBoundingClientRect();if(!r)return;
        const width=Math.min(248,window.innerWidth-24),height=menuRef.current?.offsetHeight||118;
        const below=window.innerHeight-r.bottom-20,above=r.top-20;
        const up=below<height&&above>below;
        setMenuStyle({position:'fixed',left:Math.max(12,Math.min(r.right-width,window.innerWidth-width-12)),width,
          top:up?'auto':r.bottom+8,bottom:up?window.innerHeight-r.top+8:'auto',maxHeight:Math.max(0,up?above:below)});
      };
      place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
      return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
    },[open,present,showProvenance]);
    (0,react.useLayoutEffect)(()=>{
      if(!refreshOpen)return;
      const r=refreshTriggerRef.current?.getBoundingClientRect(),m=menuRef.current?.getBoundingClientRect();if(!r||!m)return;
      const width=Math.min(220,window.innerWidth-24),height=submenuRef.current?.offsetHeight||190;
      const left=(m.right+8+width>window.innerWidth-12?-width-8:m.width+8)-menuRef.current.clientLeft;
      setSubmenuStyle({left,top:Math.max(12,Math.min(r.top,window.innerHeight-height-12))-m.top-menuRef.current.clientTop,width});
      if(focusSubmenuRef.current){focusSubmenuRef.current=false;submenuRef.current?.querySelector('[aria-checked=true]')?.focus({preventScroll:true});}
    },[refreshOpen]);`)
  exact('if (event.key === "Escape") { event.preventDefault(); close(); return; }', `if (refreshOpen && (event.key === 'Escape' || event.key === 'ArrowLeft')) {
      event.preventDefault();setRefreshOpen(false);refreshTriggerRef.current?.focus({preventScroll:true});return;
    }
    if(event.key==='ArrowRight' && event.target===refreshTriggerRef.current){event.preventDefault();focusSubmenuRef.current=true;setRefreshOpen(true);return;}
    if (event.key === "Escape") { event.preventDefault(); close(); return; }`)
  exact('const available = items();\n\t\t\t\t\tconst index', 'const available = items(event.target);\n\t\t\t\t\tconst index')
  exact('}), present ? (0, react_jsx_runtime.jsxs)("div", {','}), present ? react_dom.createPortal((0, react_jsx_runtime.jsxs)("div", {')
  exact('id: menuId, role: open ?', 'ref:menuRef,style:menuStyle,onMouseLeave:()=>setRefreshOpen(false),"data-odyssey-container-menu":"",id: menuId, role: open ?')
  const a=part.indexOf('(0, react_jsx_runtime.jsx)("div", { role: "separator" }),'),b=part.indexOf('\n\t\t\t\t\t]\n',a)
  if(a<0||b<a)throw Error('Refresh entries missing')
  part=part.slice(0,a)+`(0,react_jsx_runtime.jsxs)('div',{className:'odyssey-refresh-parent',onMouseEnter:()=>{if(!editingPrompt)setRefreshOpen(true);},children:[
    (0,react_jsx_runtime.jsxs)('button',{type:'button',role:'menuitem',ref:refreshTriggerRef,'data-research-container-refresh-submenu':'','aria-haspopup':'menu','aria-expanded':refreshOpen,disabled:editingPrompt,
      onClick:()=>{focusSubmenuRef.current=true;setRefreshOpen(!refreshOpen);},children:[(0,react_jsx_runtime.jsx)('span',{children:'自动刷新'}),(0,react_jsx_runtime.jsx)('small',{children:node.refreshMinutes===0?'关闭':('每 '+node.refreshMinutes+' 分钟')}),(0,react_jsx_runtime.jsx)('span',{'aria-hidden':true,className:'odyssey-submenu-chevron'})]}),
    refreshOpen && (0,react_jsx_runtime.jsx)('div',{ref:submenuRef,role:'menu','aria-label':'自动刷新频率','data-odyssey-refresh-options':'',style:submenuStyle,children:[0,1,5,15,30].map(minutes=>(0,react_jsx_runtime.jsxs)('button',{type:'button',role:'menuitemradio','aria-checked':node.refreshMinutes===minutes,'data-research-container-refresh-minutes':minutes,disabled:editingPrompt,onClick:()=>choose(()=>onSetRefresh?.(node,minutes)),children:[(0,react_jsx_runtime.jsx)('span',{children:minutes===0?'不自动刷新':('每 '+minutes+' 分钟')}),node.refreshMinutes===minutes&&(0,react_jsx_runtime.jsx)('span',{'aria-hidden':true,className:'odyssey-menu-check'})]},minutes))})
  ]})`+part.slice(b)
  exact('\n\t\t\t\t}) : null]','\n\t\t\t\t}),document.body) : null]')
  return source.slice(0,start)+part+source.slice(end)
}
