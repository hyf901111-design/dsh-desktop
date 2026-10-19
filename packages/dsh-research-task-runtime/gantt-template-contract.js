// Shared by model guidance, validation, repair messages and trusted rendering.
export const GANTT_MAX_ITEMS = 120;
export const GANTT_GUIDANCE = '{"version":1,"type":"gantt","title":"标题","asOf":"来源或模拟数据与日期口径","items":[{"label":"阶段或场次","start":"YYYY-MM-DD","end":"YYYY-MM-DD","progress":0,"owner":"负责人","detail":"完整设备、到场条件或备选方案"}]}。1–120条，完整JSON≤64KB，总跨度≤366天。日期记录保留YYYY-MM-DD并包含结束日全天；小时排期必须用合法ISO YYYY-MM-DDTHH:mm（可带秒、毫秒及Z或±HH:mm偏移），不得把时分藏到label并截成日期。每条起止精度和时区口径一致，所有小时记录均带明确偏移或均不带；带偏移按实际时刻比较，坐标轴使用首条偏移。不带偏移表示共同当地排期时间，不按设备时区转换。跨午夜结束时间必须写次日的完整日期；end不得早于start，不猜造或自动改日期。progress可选0–100，owner可选≤80字，detail可选≤2000字；详情完整保留并在点击或键盘选中时显示。超容量应拆分，不截断记录。';
const DAY = 86400000;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
function timestamp(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)?)?$/);
  if (!m || m[1].startsWith('0000')) return null;
  const day = Date.parse(m[1] + 'T00:00:00Z');
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== m[1]) return null;
  const timed = m[2] !== undefined, zone = m[6];
  if (zone && /^[+-]14:(?!00)/.test(zone)) return null;
  const offset = !zone ? null : zone === 'Z' ? 0 : (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4)));
  const local = day + (Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0)) * 1000 + Number((m[5] ?? '').padEnd(3, '0'));
  return { timed, offset, local, time: local - (offset ?? 0) * 60000 };
}
export function parseGanttSpec(spec) {
  const fail = issue => ({ issue });
  if (spec?.version !== 1 || spec.type !== 'gantt' || !text(spec.title, 256) || !text(spec.asOf, 256)) return fail('gantt 需要 version:1、title 和 asOf。');
  if (!Array.isArray(spec.items) || spec.items.length < 1 || spec.items.length > GANTT_MAX_ITEMS) return fail(`gantt.items 需要1–${GANTT_MAX_ITEMS}条完整排期，超限请拆分，不能截断。`);
  if (new TextEncoder().encode(JSON.stringify(spec)).length > 64000) return fail('完整甘特图超过64KB，请拆分，不截断字段或排期。');
  const items = [];
  let offset, zoneKind;
  for (const [i, item] of spec.items.entries()) {
    const label = `gantt.items[${i}]`;
    if (!item || !text(item.label, 128) || item.owner !== undefined && (typeof item.owner !== 'string' || item.owner.length > 80) || item.detail !== undefined && (typeof item.detail !== 'string' || item.detail.length > 2000) || item.progress !== undefined && (!Number.isFinite(item.progress) || item.progress < 0 || item.progress > 100)) return fail(`${label} 需要完整label；owner≤80字，detail≤2000字，progress为0–100。`);
    const start = timestamp(item.start), end = timestamp(item.end);
    if (!start || !end) return fail(`${label} 的start/end不是合法日期或ISO时间；保留时分，小时0–23、分秒0–59，偏移最多±14:00。`);
    if (start.timed !== end.timed || start.timed && (start.offset === null) !== (end.offset === null)) return fail(`${label} 的起止精度和时区口径须一致，不能混用日期/小时或有偏移/无偏移时间。`);
    if (start.timed) {
      const kind = start.offset === null ? 'local' : 'offset';
      if (zoneKind && zoneKind !== kind) return fail('小时排期不能混用有偏移与无偏移的时间；请提供共同明确口径，不猜造时区。');
      zoneKind = kind; offset ??= start.offset;
    }
    if (end.time < start.time) return fail(`${label} 的end早于start；跨午夜请明确次日日期，不能截时分或自动改日期。`);
    items.push({ ...item, startValue: start, endValue: end });
  }
  const timed = Boolean(zoneKind), axisOffset = offset ?? 0;
  for (const item of items) {
    item.startTime = item.startValue.timed ? item.startValue.time : item.startValue.local - axisOffset * 60000;
    item.endTime = item.endValue.timed ? item.endValue.time : item.endValue.local - axisOffset * 60000 + DAY;
  }
  const first = Math.min(...items.map(item => item.startTime)), last = Math.max(...items.map(item => item.endTime));
  const span = Math.max(1, last - first);
  if (span > 366 * DAY) return fail('甘特图总跨度不能超过366天，请按原时间拆分，不修改日期。');
  return { items, first, last, span, timed, axisOffset, zoneKind };
}
export const ganttDataIssue = spec => parseGanttSpec(spec).issue ?? null;
