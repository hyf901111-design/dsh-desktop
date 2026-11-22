// Imported into the native host bundle by the desktop's existing patch entry.
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Office catalog anchor drifted: ' + before.slice(0, 65))
  return source.replace(before, () => after)
}

export function patchOfficeCatalogHost(source) {
  const marker = '/* ework:office-catalog-checkpoints */'
  if (source.includes(marker)) return source
  const batch = 'for (let offset = 0; offset < cold.length; offset += COLD_SUMMARY_BATCH_SIZE) {'
  source = replaceOnce(source, batch, marker + '\n const checkpoints = [];\n ' + batch)
  source = replaceOnce(source, 'ctx.get("sessionProjectionCache")?.coldSnapshot)', 'ctx.get("sessionProjectionCache")?.listSnapshot)')
  source = replaceOnce(source, 'ctx.get("sessionProjectionCache").coldSnapshot(meta.id, signal, meta)',
    'ctx.get("sessionProjectionCache").listSnapshot(meta, signal, sessionListMetadata, checkpoints)')
  const end = 'items.push(...summaries);\n\t\t\t}\n\t\t}\n\t\titems.sort'
  return replaceOnce(source, end, end.replace('items.push(...summaries);', 'items.push(...summaries);\n        if (checkpoints.length >= 256) await ctx.get("sessionProjectionCache").saveListCheckpoints(checkpoints.splice(0));').replace('\n\t\t}', '\n      if (checkpoints.length) await ctx.get("sessionProjectionCache").saveListCheckpoints(checkpoints);\n\t\t}'))
}

export function patchOfficeCatalogCache(source) {
  const marker = '/* ework:office-catalog-list-snapshot */'
  if (source.includes(marker)) return source
  const anchor = '\n\tinstallWritePath() {'
  return replaceOnce(source, anchor, `
  ${marker}
  async listSnapshot(meta, signal, foldMetadata, checkpoints) {
    const table = this.requireTable();
    const original = table.get(meta.id);
    const persistence = this.ctx.sessionPersistence;
    const log = persistence.readListEvents ? await persistence.readListEvents(meta, signal) : await persistence.readFrom(meta.id, 0, signal);
    const identity = identityOf(log.meta);
    if (!identityMatches(identity, identityOf(meta))) throw Error('Session changed while listing');
    const seq = log.events.at(-1)?.seq ?? -1;
    const metadata = foldMetadata(log.events);
    const title = log.events.findLast(event => event.type === 'session/title')?.data?.title ?? null;
    // Keep all existing projection states and watermarks. The sidebar needs
    // just these two values. Opening the session restores other units normally.
    const rows = {
      ...(original && identityMatches(original.identity, identity) ? original.rows : {}),
      sessionListMetadata:{ver:3,seq,val:metadata}, title:{ver:1,seq,val:title}
    };
    checkpoints.push({id:meta.id, original, record:{identity,rows}});
    const previous = this.cachedSnapshot(meta);
    return {asOfSeq: Math.min(previous?.asOfSeq ?? seq, seq), values:{...previous?.values, title, sessionListMetadata:metadata}};
  }
  async saveListCheckpoints(checkpoints) {
    try { await this.requireTable().putUnchanged(checkpoints); }
    catch (error) { this.ctx.logger.warn('Session list checkpoint write failed: '+String(error)); }
  }
` + anchor)
}

export function patchOfficeCatalogTable(source) {
  const marker = '/* ework:office-catalog-compare-and-put */'
  if (source.includes(marker)) return source
  const anchor = '\n\tput(key, value) {'
  return replaceOnce(source, anchor, `
  ${marker}
  putUnchanged(candidates) {
    return this.host.enqueue(async () => {
      // Another cold read or a live session write may have won the race.
      const entries = candidates.filter(({id,original}) => this.records.get(id) === original).map(({id,record}) => [id,record]);
      if (!entries.length) return;
      const publish = ([key,value]) => { this.records.set(key,value); this.emitPut(key,value); };
      if (this.host.unit.putRecords) {
        await this.host.unit.putRecords(this.tableName,entries);
        entries.forEach(publish);
      } else for (const entry of entries) {
        await this.host.unit.putRecord(this.tableName,...entry);
        publish(entry);
      }
    });
  }` + anchor)
}

export function patchOfficeCatalogJson(source) {
  const marker = '/* ework:office-catalog-atomic-batch */'
  if (source.includes(marker)) return source
  const anchor = '\n\tasync putRecord(table, key, value) {'
  return replaceOnce(source, anchor, `
  ${marker}
  async putRecords(table,entries) {
    this.assertOpen();
    const original = this.records(table);
    const next = new Map(original);
    for (const [id,record] of entries) next.set(id,record);
    this.state.tables.set(table,next);
    try { await this.publish(); }
    catch (error) { this.state.tables.set(table,original); throw error; }
  }` + anchor)
}

// The first complete inventory after a checkpoint version changes may read
// years of compressed journals. Keep the normal deadline for activity probes.
export function patchOfficeCatalogTransport(source) {
  const marker = '/* ework:office-catalog-inventory-deadline */'
  if (source.includes(marker)) return source
  const method = 'list: (payload, signal) => this.callUnary("session.list", payload, signal),'
  return replaceOnce(source, method, marker + `
    list: (payload, signal) => {
      if (payload?.activitySessionIds || payload?.identitySessionId) return this.callUnary("session.list", payload, signal);
      const deadline = AbortSignal.timeout(Math.max(this.timeoutMs, 120000));
      return this.callUnary("session.list", payload, signal ? AbortSignal.any([signal, deadline]) : deadline, "external");
    },`)
}
