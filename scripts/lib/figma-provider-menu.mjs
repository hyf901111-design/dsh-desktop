// 667:27297 / 667:27402: choose a provider before opening its existing editor.
export function patchFigmaProviderMenu(source) {
  const marker = '/* odyssey:provider-directory:20260912 */'
  if (source.includes(marker)) return source
  const exact = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Provider directory anchor drifted: ' + before.slice(0, 70))
    source = source.replace(before, after)
  }
  exact('function Loaded({ injected }) {', `function FigmaProviderDirectory({ rows, writable, canCustomize, t, onChoose, onCustom }) {
    ${marker}
    const [open,setOpen] = (0,react.useState)(false), [query,setQuery] = (0,react.useState)('');
    const anchorRef = (0,react.useRef)(null);
    const chinese = t('title') === '模型';
    const close = () => { setOpen(false); anchorRef.current?.focus({preventScroll:true}); };
    (0,react.useEffect)(()=>{
      if(!open)return;
      const keydown = event => {
        const menu=document.querySelector('[role="menu"]:has(.odyssey-provider-search)');
        if(!menu || (!menu.contains(event.target) && event.target!==anchorRef.current))return;
        const options=[...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        const index=options.indexOf(document.activeElement);
        let next;
        if(event.key==='ArrowDown')next=(index+1)%options.length;
        else if(event.key==='ArrowUp')next=(index-1+options.length)%options.length;
        else if(event.key==='Home' && event.target.tagName!=='INPUT')next=0;
        else if(event.key==='End' && event.target.tagName!=='INPUT')next=options.length-1;
        else if(event.key==='Enter' && event.target.tagName==='INPUT'){event.preventDefault();options[0]?.click();return;}
        else if(event.key==='Escape'){event.preventDefault();close();return;}
        if(next!==undefined){event.preventDefault();options[next]?.focus({preventScroll:true});}
      };
      document.addEventListener('keydown',keydown);
      return()=>document.removeEventListener('keydown',keydown);
    },[open]);
    const needle=query.trim().toLocaleLowerCase();
    const directory=rows.filter(row=>row.entry.settingsNs!=='' && (row.entry.displayName+' '+row.entry.provider).toLocaleLowerCase().includes(needle))
      .sort((a,b)=>(SETTINGS_PROVIDER_RANK.get(a.entry.provider)??999)-(SETTINGS_PROVIDER_RANK.get(b.entry.provider)??999)||a.entry.displayName.localeCompare(b.entry.displayName));
    const items=[{type:'label',id:'search',text:(0,react_jsx_runtime.jsx)('input',{className:'odyssey-provider-search',type:'search',value:query,autoFocus:true,
      placeholder:chinese?'搜索提供方…':t('providerSearch'),'aria-label':t('providerSearch'),onInput:event=>setQuery(event.currentTarget.value)})},
      ...directory.map(row=>({id:row.entry.provider,disabled:!writable||row.configured,label:(0,react_jsx_runtime.jsxs)('span',{className:'odyssey-provider-option',children:[
        (0,react_jsx_runtime.jsx)('span',{children:row.entry.displayName}),row.configured&&(0,react_jsx_runtime.jsx)('small',{children:chinese?'已添加':'Added'})]})}))];
    if(!directory.length)items.push({type:'label',id:'empty',text:chinese?'没有匹配的提供方':'No matching providers'});
    return (0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu,{open,portal:true,align:'start',className:'odyssey-provider-directory',items,
      footer:[{id:'__custom',label:chinese?'添加自定义提供方…':t('customAdd'),disabled:!writable||!canCustomize}],onClose:close,
      onSelect:id=>{close();if(id==='__custom'){onCustom();return;}const row=directory.find(row=>row.entry.provider===id);if(row&&!row.configured&&writable)onChoose(row);},
      anchor:(0,react_jsx_runtime.jsxs)('button',{type:'button',ref:anchorRef,className:ModelsSection_module_css_default.addButton,disabled:!writable,
        'aria-haspopup':'menu','aria-expanded':open,onClick:()=>{setQuery('');setOpen(!open);},children:[(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16,{size:14}),t('add')]})});
  }
  function Loaded({ injected }) {`)
  const start = source.indexOf('children: [(0, react_jsx_runtime.jsxs)("button", {', source.indexOf('className: ModelsSection_module_css_default["addActions"]'))
  const end = source.indexOf('}), (0, react_jsx_runtime.jsxs)("button", {', start)
  if (start < 0 || end < start) throw Error('Provider add entry drifted')
  source = source.slice(0, start) + `children: [(0,react_jsx_runtime.jsx)(FigmaProviderDirectory,{rows:state.rows,writable:state.writable,canCustomize:protocols.length>0,t,
    onChoose:row=>{setSavedTarget(void 0);setDeclaring(false);setAdding(true);setEditing(targetOf(row));setProviderPickerOpen(false);setProviderQuery('');},
    onCustom:()=>{setSavedTarget(void 0);setAdding(false);setEditing(void 0);setDeclaring(true);}
  ` + source.slice(end)
  return source
}
