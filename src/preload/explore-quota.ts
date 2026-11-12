export type QuotaWindow = { limit: number; remaining: number; resetAt: number | null; used?: number; reserved?: number }
export type ExploreQuota = { fiveHour: QuotaWindow; week: QuotaWindow; paused: boolean; monthResetAt?: number }
export function readExploreQuota(value: unknown): ExploreQuota | undefined {
  const data = value as Partial<ExploreQuota> | null
  const valid = (entry: QuotaWindow | undefined): entry is QuotaWindow => !!entry &&
    Number.isFinite(entry.limit) && entry.limit >= 0 && Number.isFinite(entry.remaining) &&
    entry.remaining >= 0 && entry.remaining <= entry.limit &&
    (entry.resetAt === null || Number.isSafeInteger(entry.resetAt) && entry.resetAt > 0)
  if (!data || !valid(data.fiveHour) || !valid(data.week)) return
  return { fiveHour: data.fiveHour, week: data.week, paused: data.paused === true,
    ...(typeof data.monthResetAt === 'number' && Number.isSafeInteger(data.monthResetAt) && data.monthResetAt > 0
      ? { monthResetAt: data.monthResetAt } : {}) }
}
export const quotaRatio = (entry: QuotaWindow): number => entry.limit > 0 ? Math.min(1, entry.remaining / entry.limit) : 0
export const quotaPercent = (ratio: number): number => ratio > 0 && ratio < 1 ? Math.max(1, Math.min(99, Math.round(ratio * 100))) : Math.round(ratio * 100)

const svgNs = 'http://www.w3.org/2000/svg'
export function createQuotaRing(doc: Document) {
  const svg = doc.createElementNS(svgNs, 'svg')
  svg.classList.add('odyssey-quota-ring')
  svg.setAttribute('viewBox', '0 0 40 40')
  svg.setAttribute('aria-hidden', 'true')
  for (const part of ['track','value']) {
    const circle = doc.createElementNS(svgNs, 'circle')
    circle.classList.add('odyssey-quota-' + part)
    circle.setAttribute('cx','20');circle.setAttribute('cy','20');circle.setAttribute('r','13')
    circle.setAttribute('pathLength','100')
    svg.append(circle)
  }
  return svg
}

export function updateQuotaRing(trigger: HTMLButtonElement, quota: ExploreQuota | undefined, label: string, english: boolean) {
  const svg = trigger.querySelector<SVGElement>('.odyssey-quota-ring')
  if (!svg) return
  const ratio = quota && quotaRatio(quota.fiveHour)
  trigger.toggleAttribute('data-quota-available', ratio !== undefined)
  trigger.toggleAttribute('data-quota-low', ratio !== undefined && ratio > 0 && ratio < .1)
  trigger.toggleAttribute('data-quota-empty', ratio === 0)
  trigger.style.setProperty('--odyssey-quota-offset', String(100 - (ratio ?? 0) * 100))
  const description = ratio === undefined ? undefined : english ?
    `${label} · 5h remaining ${quotaPercent(ratio)}%` : `${label} · 5 小时剩余用量 ${quotaPercent(ratio)}%`
  trigger.title = description ?? ''
  trigger.setAttribute('aria-label', label)
  if(description)trigger.setAttribute('aria-description',description)
  else trigger.removeAttribute('aria-description')
}

export function renderExploreQuota(panel: HTMLElement, quota: ExploreQuota | undefined, state: 'loading' | 'unavailable', english: boolean) {
  const doc = panel.ownerDocument
  const word = (zh: string, en: string) => english ? en : zh
  if (!quota) {
    const status = doc.createElement('p')
    status.className = 'odyssey-explore-quota-status'
    status.role = 'status'
    status.textContent = state === 'loading' ? word('正在获取用量…','Loading usage…') :
      word('暂时无法获取用量，请稍后重试。','Usage is unavailable. Try again shortly.')
    panel.replaceChildren(status)
    return
  }
  const card = doc.createElement('div')
  card.className = 'odyssey-explore-quota-card'
  const formatAfp = new Intl.NumberFormat(english ? 'en' : 'zh-CN', { maximumFractionDigits: 2 })
  for (const [label, entry] of [[word('5 小时用量','5-hour usage'), quota.fiveHour], [word('周用量','Weekly usage'), quota.week]] as const) {
    const ratio = quotaRatio(entry), percent = quotaPercent(ratio)
    const row = doc.createElement('section'), body = doc.createElement('div'), heading = doc.createElement('div')
    row.className = 'odyssey-explore-quota-row'; body.className = 'odyssey-explore-quota-meter'; heading.className = 'odyssey-explore-quota-heading'
    const name = doc.createElement('strong'), reset = doc.createElement('small')
    name.textContent = label
    const minutes = entry.resetAt === null ? null : Math.max(0, Math.ceil((entry.resetAt * 1000 - Date.now()) / 60000))
    if (quota.paused) reset.textContent = word('额度已暂停','Quota paused')
    else if (minutes === null) reset.textContent = word('首次使用后开始计时','Starts on first use')
    else if (minutes === 0) reset.textContent = word('即将重置','Resets shortly')
    else {
      const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60)
      reset.textContent = days ? word(`${days} 天${hours ? ' ' + hours + ' 小时' : ''}后重置`, `Resets in ${days}d ${hours}h`) :
        hours ? word(`${hours} 小时后重置`, `Resets in ${hours}h`) : word(`${minutes} 分钟后重置`, `Resets in ${minutes}m`)
      if (entry.resetAt) reset.title = new Date(entry.resetAt * 1000).toLocaleString(english ? 'en' : 'zh-CN')
    }
    heading.append(name,reset)
    const track = doc.createElement('div'), progress = doc.createElement('i')
    track.className = 'odyssey-explore-quota-track'
    track.setAttribute('role','meter');track.setAttribute('aria-label',label + ' · ' + word('剩余用量','Remaining'))
    track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(percent))
    progress.style.width = `${100 * ratio}%`
    progress.toggleAttribute('data-low', ratio > 0 && ratio < .1)
    track.append(progress);body.append(heading,track)
    if (typeof entry.used === 'number' && Number.isFinite(entry.used) && entry.used >= 0 &&
        typeof entry.reserved === 'number' && Number.isFinite(entry.reserved) && entry.reserved >= 0) {
      const breakdown = doc.createElement('div')
      breakdown.className = 'odyssey-explore-quota-breakdown'
      const used = formatAfp.format(entry.used), reserved = formatAfp.format(entry.reserved)
      breakdown.textContent = word(`已用 ${used} AFP · 预留 ${reserved} AFP`, `Used ${used} AFP · Reserved ${reserved} AFP`)
      breakdown.title = word('预留用量来自进行中或尚未结算的请求。', 'Reserved usage includes in-progress and unsettled requests.')
      body.append(breakdown)
    }
    const balance = doc.createElement('div'), number = doc.createElement('strong'), remaining = doc.createElement('span')
    balance.className = 'odyssey-explore-quota-balance'
    number.textContent = percent + '%';remaining.textContent = word('剩余用量','Remaining')
    balance.append(number,remaining);row.append(body,balance);card.append(row)
  }
  panel.replaceChildren(card)
}
