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
  source = source.replaceAll("'当前看板目录'", "'新建看板目录'")
  if (source.includes('/* BOARD_DIRECTORY_WORKSPACE_V1 */')) return source
  source = change(source, 'function WorkspacePickFlow({ t, open,', 'function WorkspacePickFlow({ boardDirectoryPath, t, open,')
  source = change(source, 'function WorkspacePicker({ open,', 'function WorkspacePicker({ boardDirectoryPath, open,')
  source = change(source, 'return (0, react_jsx_runtime.jsx)(WorkspacePickFlow, {', 'return (0, react_jsx_runtime.jsx)(WorkspacePickFlow, { boardDirectoryPath,')
  source = change(source, 'const menuIsEmpty = items.length === 0;', `if (boardDirectoryPath) items.unshift({id:'::board-directory',label:chinese ? '新建看板目录' : 'Current board directory',disabled:flowBusy});
      const menuIsEmpty = items.length === 0;`)
  source = change(source, 'const addIsTheOnlyEntry = !pinAdd &&', 'const addIsTheOnlyEntry = !boardDirectoryPath && !pinAdd &&')
  return source + '\n/* BOARD_DIRECTORY_WORKSPACE_V1 */'
}
