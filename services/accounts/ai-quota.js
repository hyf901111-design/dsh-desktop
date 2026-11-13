export const AFP_UNITS = 1_000_000
const DAY = 86_400
const WEEK = 7 * DAY
const FIVE_HOURS = 5 * 3600
const BEIJING_OFFSET = 8 * 3600
const KINDS = ['week', 'fiveHour']
const now = () => Math.floor(Date.now() / 1000)

export class AiQuotaError extends Error {
  constructor(code, message, status = 409) {
    super(message)
    this.code = code
    this.status = status
  }
}

function billingCycle(pool, at) {
  if (at < pool.first_start) return null
  if (at < pool.first_end) return { startAt: pool.first_start, endAt: pool.first_end }
  const anchor = new Date((pool.first_end + BEIJING_OFFSET) * 1000)
  const local = new Date((at + BEIJING_OFFSET) * 1000)
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()
  const boundary = offset => {
    const lastDay = new Date(Date.UTC(year, month + offset + 1, 0)).getUTCDate()
    return Date.UTC(year, month + offset, Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds()) / 1000 - BEIJING_OFFSET
  }
  let offset = (local.getUTCFullYear() - year) * 12 + local.getUTCMonth() - month
  if (boundary(offset) > at) offset--
  return { startAt: boundary(offset), endAt: boundary(offset + 1) }
}

function balance(limit, used, reserved) {
  return Math.max(0, limit - used - reserved)
}

function distribute(people, usage, capField, available) {
  const eligible = people.filter(person => !person.disabled && !person.paused).map(person => {
    const occupied = usage.get(person.id)
    return { id: person.id, cap: person[capField] === null ? Infinity :
      balance(person[capField], occupied?.used ?? 0, occupied?.reserved ?? 0) }
  }).sort((left, right) => left.cap - right.cap)

  const grants = new Map()
  for (let index = 0; index < eligible.length; index++) {
    const share = Math.floor(available / (eligible.length - index))
    const person = eligible[index]
    if (person.cap < share) {
      if (person.cap > 0) grants.set(person.id, person.cap)
      available -= person.cap
      continue
    }
    if (share > 0) for (const remaining of eligible.slice(index)) grants.set(remaining.id, share)
    break
  }
  return grants
}

function projectWindow({ kind, stored, startAt, endAt, limit, data, usageRows, grantRows, capField }) {
  const usage = new Map(usageRows.map(row => [row.user_id, row]))
  const used = usageRows.reduce((sum, row) => sum + row.used, 0)
  const reserved = usageRows.reduce((sum, row) => sum + row.reserved, 0)
  const remaining = balance(limit, used, reserved)
  const reallocate = !stored || stored.roster_version !== data.pool.roster_version || stored.limit_units !== limit
  const grants = reallocate ? distribute(data.people, usage, capField, remaining) :
    new Map(grantRows.map(row => [row.user_id, row.units]))
  return {
    kind, stored, startAt, endAt, limit, used, reserved, remaining, usage, grants, reallocate,
    generation: reallocate ? data.pool.revision + 1 : stored.generation
  }
}

function quotaView(window, remaining = window.remaining) {
  return { limit: window.limit / AFP_UNITS, used: window.used / AFP_UNITS,
    reserved: window.reserved / AFP_UNITS, remaining: remaining / AFP_UNITS, resetAt: window.endAt }
}

function userWindow(window, userId, eligible, monthlyRemaining) {
  const { used = 0, reserved = 0, epochUnits = 0 } = window.usage.get(userId) ?? {}
  const grant = window.grants.get(userId) ?? 0
  const available = eligible ? Math.max(0, grant - (window.reallocate ? 0 : epochUnits)) : 0
  const remaining = Math.min(available, window.remaining, monthlyRemaining)
  return quotaView({ limit: used + reserved + remaining, used, reserved,
    endAt: window.kind === 'fiveHour' && !window.stored ? null : window.endAt }, remaining)
}

function userBalance(data, person) {
  const eligible = !person.disabled && !person.paused
  return {
    eligible, paused: Boolean(person.paused),
    fiveHour: userWindow(data.fiveHour, person.id, eligible, data.month.remaining),
    week: userWindow(data.week, person.id, eligible, data.month.remaining)
  }
}

function keyOf({ userId, requestId, step = 0 }) {
  if (typeof userId !== 'string' || userId.length < 1 || userId.length > 128 ||
      typeof requestId !== 'string' || !/^[-a-zA-Z0-9_]{1,128}$/.test(requestId) ||
      !Number.isSafeInteger(step) || step < 0) {
    throw new AiQuotaError('AI_QUOTA_REQUEST_INVALID', '额度请求标识无效', 400)
  }
  return [userId, requestId, step]
}

const requestWhere = 'user_id=? AND request_id=? AND step=?'
const stale = () => new AiQuotaError('AI_QUOTA_STALE', '额度正在更新，请稍后重试')
const unavailable = () => new AiQuotaError('AI_QUOTA_UNAVAILABLE', 'AI 额度池暂未配置', 503)

export class AiQuotaLedger {
  constructor(db, { clock = now } = {}) {
    this.db = db
    this.clock = clock
  }

  statement(sql, ...params) {
    return this.db.prepare(sql).bind(...params)
  }

  async ready() {
    return Boolean(await this.statement("SELECT 1 FROM sqlite_master WHERE name='ai_quota_pool'").first())
  }

  async settings(userId) {
    return this.statement(`SELECT u.id, u.username, u.disabled,
      COALESCE(s.paused,0) AS paused, COALESCE(s.version,0) AS version,
      s.weekly_limit_units, s.five_hour_limit_units
      FROM users u LEFT JOIN ai_quota_user_settings s ON s.user_id=u.id WHERE u.id=?`, userId).first()
  }

  async limits() {
    const pool = await this.statement('SELECT weekly_limit_units, five_hour_limit_units FROM ai_quota_pool WHERE id=1').first()
    if (!pool) throw unavailable()
    return { week: pool.weekly_limit_units / AFP_UNITS, fiveHour: pool.five_hour_limit_units / AFP_UNITS }
  }

  windowUsage(kind, startAt, at) {
    const column = kind === 'week' ? 'week' : 'five_hour'
    return this.statement(`SELECT r.user_id,
      COALESCE(SUM(r.billed_units),0) AS used,
      COALESCE(SUM(r.held_units) FILTER (WHERE r.billed_units IS NULL),0) AS reserved,
      COALESCE(SUM(COALESCE(r.billed_units,r.held_units)) FILTER (WHERE r.${column}_generation=w.generation),0) AS epochUnits
      FROM ai_quota_windows w JOIN ai_quota_requests r ON r.${column}_at=w.start_at
      WHERE w.kind=? AND w.start_at>=? AND w.start_at<=? AND w.end_at>?
      GROUP BY r.user_id`, kind, startAt, at, at)
  }

  async snapshot(key) {
    const pool = await this.statement('SELECT * FROM ai_quota_pool WHERE id=1').first()
    if (!pool) throw unavailable()
    const at = this.clock()
    const cycle = billingCycle(pool, at)
    if (!cycle) throw unavailable()
    const monday = at - (at + BEIJING_OFFSET + 3 * DAY) % WEEK
    const weekStart = Math.max(cycle.startAt, monday)
    const weekEnd = Math.min(cycle.endAt, monday + WEEK)
    const [revision, people, windows, grants, monthUsage, weekUsage, shortUsage, existing] = await this.db.batch([
      this.statement('SELECT revision FROM ai_quota_pool WHERE id=1'),
      this.statement(`SELECT u.id, u.disabled, s.weekly_limit_units, s.five_hour_limit_units,
        COALESCE(s.paused,0) AS paused, COALESCE(s.version,0) AS version
        FROM users u LEFT JOIN ai_quota_user_settings s ON s.user_id=u.id`),
      this.statement('SELECT * FROM ai_quota_windows WHERE start_at>=? AND start_at<=? AND end_at>?', weekStart, at, at),
      this.statement(`SELECT g.kind,g.user_id,g.units FROM ai_quota_grants g JOIN ai_quota_windows w ON w.kind=g.kind
        WHERE w.start_at>=? AND w.start_at<=? AND w.end_at>?`, weekStart, at, at),
      this.statement(`SELECT
        (SELECT COALESCE(SUM(billed_units),0) FROM ai_quota_requests WHERE charged_month_at=?) AS used,
        (SELECT COALESCE(SUM(held_units),0) FROM ai_quota_requests WHERE billed_units IS NULL) AS reserved`, cycle.startAt),
      this.windowUsage('week', weekStart, at),
      this.windowUsage('fiveHour', weekStart, at),
      ...(key ? [this.statement('SELECT * FROM ai_quota_requests WHERE ' + requestWhere, ...key)] : [])
    ])
    if (revision.results[0].revision !== pool.revision) throw stale()

    const data = { pool, people: people.results, at, existing: existing?.results[0] }
    const month = { ...cycle, limit: pool.monthly_limit_units, ...monthUsage.results[0] }
    month.remaining = balance(month.limit, month.used, month.reserved)
    const storedWeek = windows.results.find(row => row.kind === 'week')
    // Each window has its own configured ceiling. The monthly balance is a
    // separate admission limit, not a time-based reduction to either window.
    const week = projectWindow({ kind: 'week', stored: storedWeek, startAt: weekStart, endAt: weekEnd,
      limit: pool.weekly_limit_units, data, usageRows: weekUsage.results,
      grantRows: grants.results.filter(row => row.kind === 'week'), capField: 'weekly_limit_units' })

    const storedShort = windows.results.find(row => row.kind === 'fiveHour')
    const fiveHour = projectWindow({ kind: 'fiveHour', stored: storedShort,
      startAt: storedShort?.start_at ?? at, endAt: storedShort?.end_at ?? Math.min(at + FIVE_HOURS, weekEnd),
      limit: pool.five_hour_limit_units, data, usageRows: shortUsage.results,
      grantRows: grants.results.filter(row => row.kind === 'fiveHour'), capField: 'five_hour_limit_units' })
    return { ...data, month, week, fiveHour }
  }

  allocationWrites(data, openWindows) {
    const statements = []
    for (const kind of KINDS) {
      const window = data[kind]
      if (!window.reallocate || (!window.stored && !openWindows)) continue
      statements.push(this.statement(`INSERT INTO ai_quota_windows(kind,start_at,end_at,limit_units,generation,roster_version)
        VALUES(?,?,?,?,?,?) ON CONFLICT(kind) DO UPDATE SET start_at=excluded.start_at,end_at=excluded.end_at,
        limit_units=excluded.limit_units,generation=excluded.generation,roster_version=excluded.roster_version`,
        kind, window.startAt, window.endAt, window.limit, window.generation, data.pool.roster_version))
      statements.push(this.statement('DELETE FROM ai_quota_grants WHERE kind=?', kind))
      const grants = [...window.grants]
      for (let start = 0; start < grants.length; start += 1000) {
        statements.push(this.statement(`INSERT INTO ai_quota_grants(kind,user_id,units)
          SELECT ?,json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)`,
          kind, JSON.stringify(grants.slice(start, start + 1000))))
      }
    }
    return statements
  }

  async write(data, statements) {
    if (!statements.length) return
    // A stale writer aborts the whole D1 batch, including all grant and request writes.
    await this.db.batch([
      this.statement('UPDATE ai_quota_pool SET revision=? WHERE id=1', data.pool.revision + 1),
      ...statements
    ])
  }

  async retry(action) {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await action()
      } catch (error) {
        if (error.code !== 'AI_QUOTA_STALE' && !String(error).includes('AI_QUOTA_STALE')) throw error
      }
    }
    throw stale()
  }

  async current() {
    return this.retry(async () => {
      const data = await this.snapshot()
      await this.write(data, this.allocationWrites(data, false))
      return data
    })
  }

  async summary() {
    const data = await this.current()
    return { eligibleUsers: data.people.filter(person => !person.disabled && !person.paused).length,
      month: { ...quotaView(data.month), startAt: data.month.startAt }, week: quotaView(data.week),
      fiveHour: { ...quotaView(data.fiveHour), resetAt: data.fiveHour.stored ? data.fiveHour.endAt : null } }
  }

  async balances() {
    const data = await this.current()
    return new Map(data.people.map(person => [person.id, userBalance(data, person)]))
  }

  async user(userId) {
    const data = await this.current()
    const person = data.people.find(item => item.id === userId)
    if (!person) throw new AiQuotaError('AI_QUOTA_USER_MISSING', '账号不存在', 404)
    return { ...userBalance(data, person), version: person.version, monthResetAt: data.month.endAt,
      fiveHourLimit: person.five_hour_limit_units === null ? null : person.five_hour_limit_units / AFP_UNITS,
      weekLimit: person.weekly_limit_units === null ? null : person.weekly_limit_units / AFP_UNITS,
      maxFiveHourLimit: data.pool.five_hour_limit_units / AFP_UNITS,
      maxWeekLimit: data.pool.weekly_limit_units / AFP_UNITS }
  }

  // Call only after account authentication. A duplicate is never a new upstream admission.
  async reserve(input) {
    const key = keyOf(input)
    const { userId, amountUnits } = input
    if (!Number.isSafeInteger(amountUnits) || amountUnits <= 0) {
      throw new AiQuotaError('AI_QUOTA_AMOUNT_INVALID', '预留额度无效', 400)
    }
    return this.retry(async () => {
      const data = await this.snapshot(key)
      if (data.existing) {
        if (data.existing.held_units !== amountUnits) throw new AiQuotaError('AI_QUOTA_REQUEST_CONFLICT', '请求已使用其他预留额度')
        return { duplicate: true, state: data.existing.billed_units === null ? 'reserved' : 'settled' }
      }
      const person = data.people.find(item => item.id === userId)
      if (!person || person.disabled || person.paused) {
        throw new AiQuotaError('AI_QUOTA_INELIGIBLE', '账号的 AI 额度已暂停', 403)
      }
      if (amountUnits > data.month.remaining) throw new AiQuotaError('AI_QUOTA_MONTH', '月度总池可用量不足', 429)
      for (const [kind, code, message] of [
        ['week', 'AI_QUOTA_WEEK', '本周可用额度不足'],
        ['fiveHour', 'AI_QUOTA_FIVE_HOUR', '本 5 小时可用额度不足']
      ]) {
        const window = data[kind]
        const usedInEpoch = window.reallocate ? 0 : (window.usage.get(userId)?.epochUnits ?? 0)
        if (amountUnits > Math.min(window.remaining, (window.grants.get(userId) ?? 0) - usedInEpoch)) {
          throw new AiQuotaError(code, message, 429)
        }
      }
      await this.write(data, [
        ...this.allocationWrites(data, true),
        this.statement(`INSERT INTO ai_quota_requests(user_id,request_id,step,admitted_at,month_at,week_at,five_hour_at,
          week_generation,five_hour_generation,held_units) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          ...key, data.at, data.month.startAt, data.week.startAt, data.fiveHour.startAt,
          data.week.generation, data.fiveHour.generation, amountUnits)
      ])
      return { duplicate: false, state: 'reserved' }
    })
  }

  // Leave uncertain requests reserved. Pass zero only when there is evidence of no charge.
  async settle(input) {
    const key = keyOf(input)
    const { actualUnits, chargedAt } = input
    if (!Number.isSafeInteger(actualUnits) || actualUnits < 0) {
      throw new AiQuotaError('AI_QUOTA_AMOUNT_INVALID', '结算额度无效', 400)
    }
    return this.retry(async () => {
      const data = await this.snapshot(key)
      const request = data.existing
      if (!request) throw new AiQuotaError('AI_QUOTA_REQUEST_MISSING', '找不到已预留的请求', 404)
      if (actualUnits > request.held_units) throw new AiQuotaError('AI_QUOTA_AMOUNT_EXCEEDED', '实际用量超过预留，请核对账单')
      if (chargedAt !== undefined && (!Number.isSafeInteger(chargedAt) || chargedAt < request.admitted_at || chargedAt > data.at)) {
        throw new AiQuotaError('AI_QUOTA_CHARGE_TIME', '扣费时间无效', 400)
      }
      const chargeMonth = chargedAt === undefined ? request.month_at : billingCycle(data.pool, chargedAt).startAt
      if (request.billed_units !== null) {
        if (request.billed_units !== actualUnits || request.charged_month_at !== chargeMonth) {
          throw new AiQuotaError('AI_QUOTA_SETTLED', '请求已结算')
        }
        return { duplicate: true }
      }
      await this.write(data, [
        ...this.allocationWrites(data, false),
        this.statement(`UPDATE ai_quota_requests SET billed_units=?,charged_month_at=?,settled_at=? WHERE ${requestWhere}`,
          actualUnits, chargeMonth, data.at, ...key)
      ])
      return { duplicate: false }
    })
  }
}
