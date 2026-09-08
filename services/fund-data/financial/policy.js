// Executable server policy. No provider choice or credential is sent to the client.
export const POLICY = Object.freeze({
  quote: Object.freeze({ stock: 'a-share', index: 'a-share-index', etf: 'fund' }),
  history: Object.freeze({ stock: ['1d','1w','1mo'], index: ['1d','1w','1mo'], etf: ['1d'] }),
  nav: Object.freeze({ unit: ['yingmi','tonghuashun'], adjusted: ['tonghuashun'] }),
  profile: Object.freeze(['yingmi','tonghuashun']),
  fallbackReasons: Object.freeze(['network_timeout','upstream_5xx','missing','stale']),
  maxSwitches: 1,
  quoteAgeSeconds: 60,
  cacheQuotes: false
})

export function chinaDate(ms) {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms + 8 * 3600000).toISOString().slice(0, 10) : undefined
}
export function quoteQuality(timestamp, calendar, now) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp > now + 60000) return 'unknown'
  const today = chinaDate(now)
  // Calendar readiness alone is insufficient: it must cover today. Never infer holidays from weekdays.
  if (!calendar || chinaDate(calendar.timestamp) !== today || !Array.isArray(calendar.item)) return 'unknown'
  const dates = calendar.item.map(r => r.date)
  if (dates.some(d => typeof d !== 'string' || !/^\d{8}$/.test(d))) return 'unknown'
  const local = new Date(now + 8 * 3600000)
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes()
  const trading = dates.includes(today.replaceAll('-', '')) && ((minute >= 570 && minute < 690) || (minute >= 780 && minute < 900))
  if (trading) return now - timestamp <= POLICY.quoteAgeSeconds * 1000 ? 'fresh' : 'delayed'
  // A closed session does not make an arbitrarily old snapshot current.
  const last = dates.filter(d => d <= today.replaceAll('-', '')).sort().at(-1)
  if (!last) return 'unknown'
  const previous = dates.filter(d => d < today.replaceAll('-', '')).sort().at(-1)
  const expected = minute < 570 && last === today.replaceAll('-', '') ? previous : last
  if (!expected) return 'unknown'
  return chinaDate(timestamp).replaceAll('-', '') < expected ? 'delayed' : 'market_closed'
}
