// The center Chat picker creates a conversation in the selected workspace.
// Native workspace connection also restores blank document sessions, so it
// cannot express this specific New Chat intent.
export function createChatWorkspaceSwitch({ sessions, workspaces, pending, shellFor, viewFor, isChat, beforeCreate, openChat }) {
  let flight
  const current = () => sessions.list.getSnapshot().current
  const target = workspaceId => workspaces.list.getSnapshot().items.find(item => item.workspaceId === workspaceId)
  async function change(source, workspaceId) {
    const project = target(workspaceId)
    if (!project) throw Error('工作区已不可用，请重新选择。')
    if (source !== undefined && project.sessionIds.includes(source)) return source
    if (current() !== source || !isChat(source)) return
    const originalView = source === undefined ? undefined : viewFor(source)
    const valid = () => {
      const owner = source === undefined ? undefined : sessions.list.getSnapshot().byId[source]
      return current() === source && isChat(source) && !owner?.running && owner?.blank !== false &&
        (source === undefined || viewFor(source) === originalView) && target(workspaceId)?.path === project.path
    }
    await beforeCreate()
    if (!valid()) return
    if (source === undefined) {
      const draft = pending()
      draft.selectWorkspace(workspaceId)
      await draft.activate({workspaceSwitch:true, view:'chat'})
      const id = draft.getSnapshot().rightSession
      if (!id || current() !== id) return
      if (!target(workspaceId)?.sessionIds.includes(id)) await workspaces.refresh()
      return id
    }
    const from = shellFor(source)
    if (!from || from.disposed) throw Error('当前输入尚未就绪，请稍后重试。')
    const id = await sessions.create({workspaceId})
    const discardUnused = async () => {
      const session = sessions.list.getSnapshot().byId[id]
      const draft = shellFor(id)?.snapshot
      if (current() !== id && session?.blank === true && !session.running && !session.title &&
          !draft?.draft && !draft?.imageIds?.length && !draft?.occurrences?.length) await workspaces.archiveSession(id)
    }
    try {
      if (!valid() || from.disposed) { await discardUnused(); return }
      const into = shellFor(id)
      if (!into || into.disposed || into.snapshot.draft || into.snapshot.imageIds?.length)
        throw Error('新会话输入尚未就绪，原输入已保留。')
      // Include edits made while the host was allocating this new scope.
      const input = from.snapshot
      if (input.imageIds?.length && !into.addImages([...input.imageIds])) throw Error('图片未能加入新会话，原输入已保留。')
      into.restoreDraftState(input)
      openChat(id)
      sessions.open(id)
      from.commitSend([...(input.imageIds ?? [])], input.draft)
    } catch (error) {
      await discardUnused()
      throw error
    }
    // Session and workspace lists are separate native projections. Read the
    // workspace membership after creation when its update has not arrived yet.
    if (!target(workspaceId)?.sessionIds.includes(id)) await workspaces.refresh()
    return id
  }
  function select(source, workspaceId) {
    if (flight) {
      if (flight.source === source && flight.workspaceId === workspaceId) return flight.promise
      // A second select can occur before the first host response. Continue
      // from its actual destination only while that same Chat remains visible.
      const previous = flight
      return previous.promise.then(id => {
        if (id && current() === id && isChat(id)) return select(id, workspaceId)
      })
    }
    const entry = {source, workspaceId}
    flight = entry
    entry.promise = change(source, workspaceId).finally(() => { if (flight === entry) flight = undefined })
    return entry.promise
  }
  return select
}
