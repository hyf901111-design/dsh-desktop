export function patchFigmaWorkspaceMenus(source) {
  const marker = '/* odyssey:workspace-menu-search:20260912 */'
  if (source.includes(marker)) return source
  const exact = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Workspace menu anchor drifted: '+before.slice(0,60))
    source = source.replace(before, after)
  }
  exact('const workspaceSnapshot = useWorkspaces((state) => state);', `const workspaceSnapshot = useWorkspaces((state) => state);
      ${marker}
      const [query,setQuery] = (0,react.useState)('');
      (0,react.useEffect)(()=>{if(!open)setQuery('');},[open]);
      const chinese = t('menu.addWorkspace').includes('工作区');
      const searchText = chinese ? '搜索工作区…' : 'Search workspaces…';`)
  exact('const items = pinAdd ? workspaces.map((workspace) => ({', 'const items = pinAdd ? workspaces.filter(workspace=>workspace.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((workspace) => ({')
  exact('label: workspace.title,\n\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { size: 16 }),','label: workspace.title,')
  exact('const menuIsEmpty = items.length === 0;', `if(pinAdd) {
        if(items.length===0)items.push({type:'label',id:'workspace-empty',text:chinese ? '没有匹配的工作区' : 'No matching workspaces'});
        items.unshift({type:'label',id:'workspace-search',text:(0,react_jsx_runtime.jsx)('input',{
          type:'search',className:'odyssey-workspace-search',value:query,placeholder:searchText,'aria-label':searchText,
          autoFocus:true,onInput:event=>setQuery(event.currentTarget.value)
        })});
      }
      const menuIsEmpty = items.length === 0;`)
  exact('className: "srb-navigation-menu", open,','className: "odyssey-view-menu", open,')
  exact('"groupBy.label": "分组方式",','"groupBy.label": "显示方式",')
  exact('"orderBy.label": "排序方式",','"orderBy.label": "排序",')
  return source
}
