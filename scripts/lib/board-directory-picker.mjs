function change(source, from, to) {
  if (!source.includes(from)) throw Error('Board directory picker anchor missing: ' + from.slice(0, 100))
  return source.replace(from, to)
}
export function patchBoardDirectoryConversation(source) {
  source = source.replace('if (boardNext) { await sherlockBoardsAdapter.openPersonal(nextId); await workspaces.archiveSession(sessionId); }', 'if (boardNext && nextId !== sessionId) { await sherlockBoardsAdapter.openPersonal(nextId); await workspaces.archiveSession(sessionId); }')
  source = source.replaceAll("'当前看板目录'", "'新建看板目录'")
  source = source.replace("ref: buttonRef, title: directoryPath ? '此看板当前的文件目录\\n' + directoryPath : undefined,", "ref: buttonRef, 'data-odyssey-board-directory': directoryPath,")
  source = source.replace('selectWorkspace(workspaceId).catch(() => {', 'selectWorkspace(workspaceId).catch((error) => { sherlockBoardsAdapter?.showError(error);')
  if (source.includes('/* BOARD_DIRECTORY_PICKER_V1 */')) return source
  source = change(source, 'const chipTitle = pendingWorkspace?.title ??', `const boardDirectory = sessionId === void 0 ? null : sherlockBoardsAdapter?.directoryChoice(sessionId);
      const chipTitle = boardDirectory?.label ?? pendingWorkspace?.title ??`)
  source = change(source, 'label: chipTitle,', `label: chipTitle, directoryPath: boardDirectory ? (cwd ?? boardDirectory.path) : undefined,`)
  source = change(source, 'function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t })', 'function WorkspaceChip({ buttonRef, label, directoryPath, menuOpen = false, onClick, t })')
  source = change(source, 'ref: buttonRef,', `ref: buttonRef, 'data-odyssey-board-directory': directoryPath,`)
  source = change(source, 'selectedId: pendingWorkspaceId ?? sessionWorkspace?.workspaceId,', `boardDirectoryPath: boardDirectory?.path,
            selectedId: boardDirectory ? (boardDirectory.workspaceId ?? '::board-directory') : pendingWorkspaceId ?? sessionWorkspace?.workspaceId,`)
  source = change(source, 'const nextId = await workspaces.connectWorkspace(workspaceId);', `const boardNext = sessionId === void 0 ? null : await sherlockBoardsAdapter?.associateProject(sessionId, workspaceId);
            const nextId = boardNext ?? await workspaces.connectWorkspace(workspaceId);`)
  source = change(source, 'sessions.open(nextId);\n\t\t\t\t\t}', `sessions.open(nextId);
            if (boardNext && nextId !== sessionId) { await sherlockBoardsAdapter.openPersonal(nextId); await workspaces.archiveSession(sessionId); }
          }`)
  return source + '\n/* BOARD_DIRECTORY_PICKER_V1 */'
}
export function patchBoardDirectoryWorkspace(source) {
  source = source.replace("items.unshift({id:'::board-directory'", "items.splice(items.findIndex(item=>item.id==='workspace-search')+1,0,{id:'::board-directory'")
  source = source.replaceAll("'当前看板目录'", "'新建看板目录'")
  if (!source.includes('/* BOARD_DIRECTORY_WORKSPACE_V1 */')) {
    source = change(source, 'function WorkspacePickFlow({ t, open,', 'function WorkspacePickFlow({ boardDirectoryPath, t, open,')
    source = change(source, 'function WorkspacePicker({ open,', 'function WorkspacePicker({ boardDirectoryPath, open,')
    source = change(source, 'return (0, react_jsx_runtime.jsx)(WorkspacePickFlow, {', 'return (0, react_jsx_runtime.jsx)(WorkspacePickFlow, { boardDirectoryPath,')
    source = change(source, 'const menuIsEmpty = items.length === 0;', `if (boardDirectoryPath) items.splice(items.findIndex(item=>item.id==='workspace-search')+1,0,{id:'::board-directory',label:chinese ? '新建看板目录' : 'Current board directory',disabled:flowBusy});
      const menuIsEmpty = items.length === 0;`)
    source = change(source, 'const addIsTheOnlyEntry = !pinAdd &&', 'const addIsTheOnlyEntry = !boardDirectoryPath && !pinAdd &&')
    source += '\n/* BOARD_DIRECTORY_WORKSPACE_V1 */'
  }
  if (source.includes('/* ODYSSEY_PROJECTLESS_PICKER_V1 */')) return source
  source = change(source, 'function WorkspacePickFlow({ boardDirectoryPath,', 'function WorkspacePickFlow({ boardDirectoryPath, allowStandalone = false,')
  source = change(source, 'function WorkspacePicker({ boardDirectoryPath,', 'function WorkspacePicker({ boardDirectoryPath, allowStandalone,')
  source = change(source, 'jsx)(WorkspacePickFlow, { boardDirectoryPath,', 'jsx)(WorkspacePickFlow, { boardDirectoryPath, allowStandalone,')
  source = change(source, 'const menuIsEmpty = items.length === 0;', `const noProjectId = '::no-project';
      const standaloneEntry = {
        id: noProjectId, disabled: flowBusy,
        label: document.documentElement.dataset.odysseyLocale === 'en' ? 'Work without a project' : '不在项目中工作',
        icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {size:16})
      };
      const menuIsEmpty = items.length === 0 && !allowStandalone;`)
  source = change(source, 'const addIsTheOnlyEntry = !boardDirectoryPath &&', 'const addIsTheOnlyEntry = !allowStandalone && !boardDirectoryPath &&')
  source = change(source, 'const handleSelect = (id) => {\n\t\t\t\tif (id === ADD_WORKSPACE)', 'const handleSelect = (id) => {\n\t\t\t\tif (allowStandalone && id === noProjectId) { onPick(null); return; }\n\t\t\t\tif (id === ADD_WORKSPACE)')
  source = change(source, '...pinAdd ? { footer: addEntries } : {},\n\t\t\t\t\tselectedId,', 'footer: [...(pinAdd ? addEntries : []), ...(allowStandalone ? [standaloneEntry] : [])],\n\t\t\t\t\tselectedId: selectedId ?? (allowStandalone ? noProjectId : undefined),')
  return source + '\n/* ODYSSEY_PROJECTLESS_PICKER_V1 */'
}

export function patchBoardFileOwnership(source) {
  if (source.includes('/* odyssey:board-file-ownership:v1 */')) {
    return source.replace(/^(\s*const heroWorkspaceRow = \()research && directoryLocked\)/m, '$1research && (!browserAppActive || directoryLocked))')
      .replace(/^(\s*const heroWorkspaceRow = )research && directoryLocked \?/m, '$1research && (!browserAppActive || directoryLocked) ?')
  }
  source = change(source, 'const descriptor = canAdmit ? await preview.admitFinderFile(file, { sessionId, nodeId }).catch(() => null) : null;', `let descriptor = null;
                try { descriptor = canAdmit ? await preview.admitFinderFile(file, { sessionId, nodeId }) : null; }
                catch (error) { sherlockBoardsAdapter?.showError(error); continue; }`)
  source = change(source, 'admitted.push({ id: nodeId, ...(typeof legacyPath === "string" ? { path: legacyPath } : {}), name: descriptor.name,', 'admitted.push({ id: nodeId, ...(typeof descriptor.path === "string" ? { path: descriptor.path } : typeof legacyPath === "string" ? { path: legacyPath } : {}), name: descriptor.name,')
  source = change(source, 'const boardDirectory = sessionId === void 0 ? null', `const directoryLockKey = 'sherlock.research.directory-locked.v1:' + sessionId;
      const directoryLocked = (researchWorkspaceSnapshot2.files?.length ?? 0) > 0 || (sessionId !== void 0 && window.localStorage.getItem(directoryLockKey) === 'true');
      (0, react.useEffect)(() => {
        if (directoryLocked && sessionId !== void 0) { window.localStorage.setItem(directoryLockKey, 'true'); setPickerOpen(false); }
      }, [sessionId, directoryLocked]);
      const boardDirectory = sessionId === void 0 ? null`)
  source = change(source, 'const heroWorkspaceRow = (0, react_jsx_runtime.jsxs)', 'const heroWorkspaceRow = research && (!browserAppActive || directoryLocked) ? null : (0, react_jsx_runtime.jsxs)')
  source = change(source, 'buttonRef: pickerAnchor,', 'buttonRef: pickerAnchor, disabled: directoryLocked,')
  source = change(source, 'function WorkspaceChip({ buttonRef, label, directoryPath,', 'function WorkspaceChip({ buttonRef, label, directoryPath, disabled = false,')
  source = change(source, "ref: buttonRef, 'data-odyssey-board-directory': directoryPath,", "ref: buttonRef, disabled, 'data-odyssey-directory-locked': disabled || undefined, 'data-odyssey-board-directory': directoryPath,")
  return source + '\n/* odyssey:board-file-ownership:v1 */'
}
