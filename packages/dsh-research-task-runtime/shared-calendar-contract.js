// Event entries live directly in the already integrated calendar containerSpec.
// A new nested events map would discard one side of concurrent FIRST additions.
export function calendarSharedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2199-12-31') return false
  const at = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value
}
export function calendarSharedEvent(value, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['id','title','date','time','timezone','notes','repeat','reminderMinutes','createdAt','updatedAt','completed'].includes(k))) return null
  if (value.id !== id || !/^[-\w]{1,128}$/.test(id) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 || /[\u0000-\u001f]/.test(value.title) || !calendarSharedDate(value.date) || value.time !== null && (typeof value.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) || typeof value.timezone !== 'string' || value.timezone.length > 100 || typeof value.notes !== 'string' || value.notes.length > 4000 || !['none','daily','weekly','monthly'].includes(value.repeat) || value.reminderMinutes !== null || !Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt)) return null
  try { new Intl.DateTimeFormat('en', {timeZone: value.timezone}) } catch { return null }
  if (!value.completed || typeof value.completed !== 'object' || Array.isArray(value.completed) || Object.keys(value.completed).length > 2048 || Object.entries(value.completed).some(([date, done]) => !calendarSharedDate(date) || done !== true)) return null
  return value
}
export function calendarSharedSpec(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.type !== 'calendar-tool' || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 256) return null
  const entries = Object.entries(value).filter(([key]) => !['version','type','title'].includes(key))
  if (entries.length > 2000 || entries.some(([key, event]) => !key.startsWith('calendarEvent:') || !calendarSharedEvent(event, key.slice(14)))) return null
  return {version:1,type:'calendar-tool',title:value.title,...Object.fromEntries(entries)}
}
