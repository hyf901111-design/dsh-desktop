/** Use the Host's durable permission setting and session projection for New Chat. */
export function createConversationPermissionPreferences(api, execute) {
  let writes = Promise.resolve()
  const readDefault = async () => {
    const { result } = await api.settings.describe({})
    if (!result.ok) throw Error(result.error.message)
    return result.value.namespaces.find(view => view.ns === 'permission')
  }

  return {
    ready: () => writes,
    select(sessionId, preset) {
      const update = writes.then(async () => {
        const view = await readDefault()
        if (!view && sessionId === undefined) throw Error('新会话的权限设置暂不可用。')
        if (sessionId !== undefined) {
          const reply = await execute(sessionId, '/permission ' + preset)
          const outcome = reply.value?.result
          if (!reply.ok || outcome?.kind !== 'success') {
            throw Error(reply.error?.message || outcome?.text || '权限未能更新。')
          }
        }
        if (!view || view.value.defaultPreset === preset) return
        const mutation = await api.settings.mutate({
          ns: view.ns,
          ops: [{ op: 'set', path: ['defaultPreset'], value: preset }],
          expectedRevision: view.revision
        })
        if (!mutation.result.ok) throw Error('新会话的默认权限未能保存：' + mutation.result.error.message)
      })
      writes = update.catch(() => {})
      return update
    },
    async prepareReuse() {
      await writes
      let preset
      try { preset = (await readDefault())?.value.defaultPreset }
      catch { return () => false }
      if (!preset) return () => true
      return async sessionId => {
        try {
          const { result } = await api.sessions.history({ sessionId, maxMessages: 1 })
          return result.ok && result.value.projections?.values.permissions?.currentValue === preset
        } catch { return false }
      }
    }
  }
}

const start = '/* ework:permission-default:start */'
const end = '/* ework:permission-default:end */'

export function stripConversationPermissionDefault(source) {
  const at = source.indexOf(start)
  if (at < 0) return source
  const close = source.indexOf(end, at)
  if (close < 0) throw Error('Conversation permission restore journal missing')
  const pairs = JSON.parse(source.slice(at + start.length, close))
  source = source.slice(0, at) + source.slice(close + end.length)
  for (const [before, after] of pairs.reverse()) {
    if (source.split(after).length !== 2) throw Error('Conversation permission restore anchor drifted')
    source = source.replace(after, () => before)
  }
  return source
}

/** Patch the composer slot after the other conversation transforms. */
export function patchConversationPermissionDefault(source) {
  source = stripConversationPermissionDefault(source)
  const init = '\n\t\t\tconst composerBlocks = new ComposerBlockRegistry();'
  const remote = '\n\t\t\t"remote",\n\t\t\t"settingsScope",'
  const command = '\n\t\t\t\t\t\t\tconst result = await session.command(line);'
  const sameSelection = 'setOpen(false);\n\t\t\t\tif (id === value.currentValue) return;\n\t\t\t\tif (id === FULL_ACCESS)'
  const workspace = '\n            const nextId = boardNext ?? await workspaces.connectWorkspace(workspaceId);'
  const pairs = [
    [remote, remote.replace('"settingsScope",', '"remote.commands",\n\t\t\t"settingsScope",')],
    [sameSelection, 'setOpen(false);\n\t\t\t\tif (id === FULL_ACCESS)'],
    [init, init + `
const permissionPreferences = (${createConversationPermissionPreferences.toString()})(
  ctx.get("connection").api, (id, line) => ctx.get("remote").commands.execute(id, line)
);
ctx.effect(() => {
  const key = Symbol.for("sherlock:conversation-permission-default");
  window[key] = permissionPreferences;
  return () => { if (window[key] === permissionPreferences) delete window[key]; };
}, "Conversation permission defaults");`],
    [command, `
              const preset = /^\\/permission ([^\\s]+)$/.exec(line)?.[1];
              if (preset && !session.getSnapshot().subagent && !sherlockShared(sessionId)) {
                try { await permissionPreferences.select(sessionId, preset); return true; }
                catch (error) { shell.notify("error", error.message); return false; }
              }
              ` + command],
    [workspace, `
            const allows = !boardNext && !sherlockShared(sessionId) ? await permissionPreferences.prepareReuse() : undefined;
            const nextId = boardNext ?? await workspaces.connectWorkspace(workspaceId, undefined, allows);`]
  ]
  for (const [before, after] of pairs) {
    if (source.split(before).length !== 2) throw Error('Conversation permission anchor drifted: ' + before)
    source = source.replace(before, () => after)
  }
  return source + start + JSON.stringify(pairs).replaceAll('*/', '*\\/') + end
}
