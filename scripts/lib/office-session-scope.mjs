// New documents bind their provisional session to the local profile or account.
// Older clients recorded only participation. The desktop checks their existing
// owner-keyed files, including recovery drafts, without moving document bytes.
function foldOfficeScope(previous, event) {
  if (event.type === 'workspace-knowledge/copied') {
    const {officeMode, officeOwner} = event.data ?? {}
    if (['note', 'spreadsheet', 'presentation'].includes(officeMode) && /^[a-f0-9]{64}$/.test(officeOwner))
      return {...previous, [officeMode]:officeOwner}
    return {...previous, copy:'legacy'}
  }
  const parts = /^workspace-(note|presentation|spreadsheet)\/(created|edited)$/.exec(event.type)
  if (!parts) return previous
  const mode = parts[1]
  if (previous?.[mode]) return previous
  const slot = event.data?.officeOwner
  if (typeof slot === 'string' && /^[a-f0-9]{64}$/.test(slot)) return {...previous, [mode]:slot}
  return parts[2] === 'edited' ? {...previous, [mode]:'legacy'} : previous
}

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Office session scope anchor drifted: ' + before.slice(0, 75))
  return source.replace(before, () => after)
}

export function patchOfficeSessionHost(source) {
  const marker = '/* ework:office-session-scope:host */'
  if (source.includes(marker)) return source
  source = replaceOnce(source, 'function applySessionListMetadata(state, event) {', marker + '\n' + foldOfficeScope.toString() + '\nfunction applySessionListMetadata(state, event) {')
  const fold = 'return blank === state.blank && lastPromptAt === state.lastPromptAt ? state : {'
  source = replaceOnce(source, fold, 'const office = foldOfficeScope(state.office, event);\n' + fold.replace('blank ===', 'office === state.office && blank ===') + '\n ...(office ? {office} : {}),')
  const schema = 'const sessionListMetadataProjectionSchema = z$1.object({'
  source = replaceOnce(source, schema, schema + '\n office:z$1.record(z$1.string(),z$1.string()).optional(),')
  source = replaceOnce(source, 'apply: applySessionListMetadata,\n\t\t\tview: (state) => state,\n\t\t\tstateVersion: 1', 'apply: applySessionListMetadata,\n\t\t\tview: (state) => state,\n\t\t\tstateVersion: 2')
  const cold = 'const projections = listProjectionsFor(ctx, meta, void 0);'
  // The native projection cache replays the old log and checkpoints v2 once.
  source = replaceOnce(source, cold, `let projections = listProjectionsFor(ctx, meta, void 0);
    if (!projections?.values.sessionListMetadata && ctx.get("sessionProjectionCache")?.coldSnapshot) {
      try { projections = await ctx.get("sessionProjectionCache").coldSnapshot(meta.id, signal, meta); }
      catch { signal?.throwIfAborted(); projections = {asOfSeq:projections?.asOfSeq ?? -1, values:{...projections?.values,sessionListMetadata:{office:{unavailable:'legacy'}}}}; }
    }`)
  return source
}

// During the one-time v1 replay the inventory already supplied a validated
// artifact path. Reuse its reader for the native checkpoint, avoiding a fresh
// search through every project directory for each old session.
export function patchOfficeProjectionCache(source) {
  const start = 'async coldSnapshot(id, signal) {'
  const marker = '/* ework:office-projection-cache */'
  if (source.includes(marker)) return source
  const at = source.indexOf(start), end = source.indexOf('\n\tinstallWritePath() {', at)
  if (at < 0 || end < at) throw Error('Office projection cache anchor drifted')
  let method = source.slice(at, end)
  method = replaceOnce(method, start, marker + '\n\tasync coldSnapshot(id, signal, knownMeta) {')
  method = method.replaceAll('persistence.readFrom(id, ', 'readFrom(')
  const anchor = 'const persistence = this.ctx.sessionPersistence;'
  method = replaceOnce(method, anchor, anchor + `
    let artifact;
    const readFrom = async (seq, signal) => {
      if (!knownMeta || knownMeta.id !== id || !persistence.readListEvents) return persistence.readFrom(id, seq, signal);
      artifact ??= persistence.readListEvents(knownMeta, signal);
      const prefix = await artifact;
      return seq === 0 ? prefix : {...prefix, events:prefix.events.filter(event => event.seq >= seq)};
    };`)
  return source.slice(0, at) + method + source.slice(end)
}

export function projectOfficeSessionScope(items, bridge, cache) {
  const missing = [], scopes = new Map(), hidden = new Map()
  for (const item of items) {
    const scope = item.projectionValues?.sessionListMetadata?.office
    if (!scope) continue
    const signature = JSON.stringify([scope, item.title])
    scopes.set(item.sessionId, signature)
    if (cache.get(item.sessionId)?.signature !== signature) missing.push([item.sessionId, scope])
  }
  if (missing.length) {
    const results = bridge.check(missing)
    for (const [id] of missing) cache.set(id, {signature:scopes.get(id), ...(results?.[id] ?? {reason:'account'})})
  }
  for (const id of scopes.keys()) {
    const reason = cache.get(id).reason
    if (reason) hidden.set(id, reason)
  }
  // A subagent row can carry its own title, even when its parent is hidden.
  if (!hidden.size) return hidden
  const parents = new Map(items.map(row => [row.sessionId, row.parentSessionId]))
  for (const item of items) {
    let parent = item.parentSessionId
    const seen = new Set()
    while (parent && !seen.has(parent)) {
      if (hidden.has(parent)) { hidden.set(item.sessionId, hidden.get(parent)); break }
      seen.add(parent)
      parent = parents.get(parent)
    }
  }
  return hidden
}

export function patchOfficeSessionClient(source) {
  const marker = '/* ework:office-session-scope:client */'
  if (source.includes(marker)) return source
  const method = 'projectList() {\n\t\t\t\tconst { items, current,'
  source = replaceOnce(source, method, `${marker}
   officeCache = new Map();
   officeHidden = new Map();
   projectList() {
    let { items, current,`)
  const before = 'const ids = [];\n\t\t\t\tconst byId = {};\n\t\t\t\tfor (const entry of items) {'
  source = replaceOnce(source, before, `if (globalThis.window?.dshDesktop?.officeSessions) {
     this.officeHidden = (${projectOfficeSessionScope.toString()})(items, window.dshDesktop.officeSessions, this.officeCache);
     for (const [parent, reason] of this.officeHidden) {
       for (const child of subagentsByParent?.[parent]?.entries ?? []) {
         if (child.kind === 'child' && !this.officeHidden.has(child.id)) this.officeHidden.set(child.id, reason);
       }
     }
     items = items.filter(entry => !this.officeHidden.has(entry.sessionId)).map(entry => {
       const title = this.officeCache.get(entry.sessionId)?.title;
       return title ? {...entry, title, projectionValues:{...entry.projectionValues,title}} : entry;
     });
     if (this.officeHidden.has(current) || currentAddress && this.officeHidden.has(currentAddress.parentSessionId)) {
       this.officeAccessNotice(this.officeHidden.get(current) || this.officeHidden.get(currentAddress.parentSessionId));
       const selected = this.manager.selected;
       queueMicrotask(() => { if (this.manager.selected === selected && this.officeHidden.has(selected)) this.manager.clearSelection(); });
       current = currentAddress = undefined;
     }
    }
    ${before}`)
  const lease = 'const address=this.manager.subagentAddress(id);\n          const child=subagentsByParent'
  if (source.includes(lease)) source = replaceOnce(source, lease, lease.replace('const child=', 'if (this.officeHidden.has(id) || this.officeHidden.has(address?.parentSessionId)) continue;\n          const child='))
  const select = 'open(id) {\n\t\t\t\tthis.manager.select(id);'
  source = replaceOnce(source, select, `officeSessionHidden(id) { return this.officeHidden.has(id); }
   officeDocumentTitle(id) { return this.officeCache.get(id)?.title; }
   officeAccessNotice(reason) { document.dispatchEvent(new CustomEvent('sherlock:office-access-notice', {detail:reason})); }
   open(id) {
    if (this.officeHidden.has(id)) { this.officeAccessNotice(this.officeHidden.get(id)); return; }
    this.manager.select(id);`)
  const subscribe = 'this.manager.subscribe(() => {\n\t\t\t\t\tthis.projectList();'
  source = replaceOnce(source, subscribe, `rootCtx.effect(() => {
    if (!globalThis.window?.dshDesktop?.officeSessions) return;
    const reset = () => {
      const previous = this.list.getSnapshot();
      this.officeCache.clear();
      this.projectList();
      if (!previous.current || !this.officeHidden.has(previous.current)) {
        const hidden = previous.ids.find(id => this.officeHidden.has(id));
        if (hidden) this.officeAccessNotice(this.officeHidden.get(hidden));
      }
    };
    document.addEventListener('sherlock:knowledge-identity-changed', reset);
    return () => document.removeEventListener('sherlock:knowledge-identity-changed', reset);
   }, 'sessions: refresh office account');
   ${subscribe}`)
  return source
}
