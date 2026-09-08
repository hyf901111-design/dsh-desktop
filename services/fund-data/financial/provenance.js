const PREFIX = 'evidence-expiry:'
const RETENTION_MS = 24 * 60 * 60 * 1000
const timeKey = time => String(time).padStart(13, '0')

// SQLite Durable Object transactions include every storage operation in this closure.
// Keep the expiry index small: ordinary queries never scan retained evidence records.
export async function retainProvenance(storage, records, now) {
  if (!records.length) return
  const id = records[0].evidence_id.slice(0, 24)
  const key = `evidence:${id}`
  const expiresAt = now + RETENTION_MS
  await storage.transaction(async () => {
    await storage.put(key, { records, expiresAt })
    await storage.put(`${PREFIX}${timeKey(expiresAt)}:${id}`, key)
    const alarm = await storage.getAlarm()
    if (alarm === null || alarm > expiresAt) await storage.setAlarm(expiresAt)
  })
}

export async function expireProvenance(storage, now) {
  await storage.transaction(async () => {
    const expired = await storage.list({ prefix: PREFIX, end: `${PREFIX}${timeKey(now + 1)}:`, limit: 64 })
    if (expired.size) await storage.delete([...expired.keys(), ...expired.values()])
    const next = await storage.list({ prefix: PREFIX, limit: 1 })
    if (next.size) {
      const expiresAt = Number(next.keys().next().value.slice(PREFIX.length, PREFIX.length + 13))
      await storage.setAlarm(Math.max(expiresAt, now + 1000))
    } else await storage.deleteAlarm()
  })
}
