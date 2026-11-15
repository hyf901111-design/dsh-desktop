export function patchFigmaWorkspaceMenus(source) {
  source = patchNewChatWorkspaceIntent(patchSessionEntryActions(patchWorkspaceFolderActions(source)))
  const marker = '/* odyssey:workspace-menu-search:20260912 */'
  const exact = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Workspace menu anchor drifted: '+before.slice(0,60))
    source = source.replace(before, after)
  }
  const addWorkspaceLabel = '"aria-label": t("workspace.add"),'
  const addWorkspaceAction = '"data-sidebar-add-workspace": "",'
  if (!source.includes(addWorkspaceAction)) exact(addWorkspaceLabel, addWorkspaceLabel + '\n' + addWorkspaceAction)
  if (source.includes(marker)) return source
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

function patchNewChatWorkspaceIntent(source) {
  const marker = '/* odyssey:workspace-new-chat-intent:v1 */'
  const before = 'ctx.workspaces.startSession(workspaceId);'
  const after = marker + '\nctx.workspaces.startSession(workspaceId, Object.assign((sessionId) => {\nwindow.dispatchEvent(new CustomEvent("sherlock:conversation-initial-chat", { detail: { sessionId } }));\n}, { canReuse: id => window[Symbol.for("sherlock:initial-chat-reuse")]?.canReuse(id) === true }));'
  if (source.includes('/* odyssey:workspace-new-chat-intent:')) {
    if (source.split(marker).length !== 2 || source.split(after).length !== 2) throw Error('Workspace New Chat intent hook drifted')
    return source
  }
  if (source.split(before).length !== 2) throw Error('Workspace New Chat intent anchor drifted')
  return source.replace(before, after)
}

function patchWorkspaceFolderActions(source) {
  const marker = '/* odyssey:workspace-folder-actions:v1 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('function workspaceMenuItems(t) {')
  const end = source.indexOf('\n\t\t}', start)
  if (start < 0 || end < start) throw Error('Workspace folder menu boundary missing')
  let menu = source.slice(start, end + 5)
  for (const [key, id, icon] of [['openInFinder', 'finder', 'IconFolderOpenOutline16'], ['rename', 'rename', 'IconEditOutline16'], ['delete.workspace', 'delete', 'IconTrashOutline16']]) {
    const before = `label: t("${key}"),\n\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.${icon}, {})`
    if (menu.split(before).length !== 2) throw Error('Workspace folder action anchor drifted: ' + id)
    menu = menu.replace(before, `label: (0, react_jsx_runtime.jsx)("span", { "data-odyssey-workspace-folder-action": "${id}", children: t("${key}") })`)
  }
  menu = menu.replace('id: "delete",', 'type: "separator", id: "workspace-delete-separator"\n            }, {\n                id: "delete",')
  return source.slice(0, start) + marker + '\n\t\t' + menu + source.slice(end + 5)
}

function patchSessionEntryActions(source) {
  const marker = '/* odyssey:session-entry-actions:v1 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('const sessionMenuItems = [')
  const end = source.indexOf('\n\t\t\t];', start)
  if (start < 0 || end < start) throw Error('Session entry menu boundary missing')
  let menu = source.slice(start, end + 6)
  for (const [key, id, icon, props] of [['rename', 'rename', 'IconEditOutline16', '{}'], ['menu.fork', 'fork', 'IconBranchOutline16', '{}'], ['menu.archiveSession', 'archive', 'IconArchiveOutline20', '{ size: 16 }']]) {
    const before = `label: t("${key}"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.${icon}, ${props})`
    if (menu.split(before).length !== 2) throw Error('Session entry action anchor drifted: ' + id)
    menu = menu.replace(before, `label: (0, react_jsx_runtime.jsx)("span", { "data-odyssey-session-entry-action": "${id}", children: t("${key}") })`)
  }
  menu = menu.replace('id: "archive",', 'type: "separator", id: "session-archive-separator"\n                }, {\n                    id: "archive",')
  return source.slice(0, start) + marker + '\n\t\t\t' + menu + source.slice(end + 6)
}
