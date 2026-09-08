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

const validEpoch = value => typeof value === 'number' && Number.isFinite(value) && value >= 946656000000 && value < 4102416000000
export function chinaDate(ms) {
  return validEpoch(ms) ? new Date(ms + 8 * 3600000).toISOString().slice(0, 10) : undefined
}
export function quoteQuality(timestamp, calendar, now) {
  if (!validEpoch(timestamp) || !validEpoch(now) || timestamp > now + 60000) return 'unknown'
  const today = chinaDate(now)
  if (!calendar || chinaDate(calendar.timestamp) !== today || !Array.isArray(calendar.item) || calendar.item.length > 400) return 'unknown'
  const dates = calendar.item.map(r => r?.date)
  if (dates.some(d => typeof d !== 'string' || !/^\d{8}$/.test(d) ||
      chinaDate(Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}T00:00:00+08:00`))?.replaceAll('-', '') !== d)) return 'unknown'
  const local = new Date(now + 8 * 3600000)
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes()
  const todayKey = today.replaceAll('-', '')
  const isTradingDay = dates.includes(todayKey)
  const trading = isTradingDay && ((minute >= 570 && minute < 690) || (minute >= 780 && minute < 900))
  if (trading) return now - timestamp <= POLICY.quoteAgeSeconds * 1000 ? 'fresh' : 'delayed'
  // A closed session still requires the latest completed session's observation, not merely the same date.
  const lastDay = dates.filter(d => d < todayKey || (d === todayKey && minute >= 570)).sort().at(-1)
  if (!lastDay) return 'unknown'
  const atLunch = isTradingDay && minute >= 690 && minute < 780
  const time = atLunch ? '11:30:00' : '15:00:00'
  const expected = Date.parse(`${lastDay.slice(0,4)}-${lastDay.slice(4,6)}-${lastDay.slice(6)}T${time}+08:00`)
  return timestamp < expected - POLICY.quoteAgeSeconds * 1000 ? 'delayed' : 'market_closed'
}
