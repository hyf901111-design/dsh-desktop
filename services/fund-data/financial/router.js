import { tushareFinancial } from './tushare.js'
import { serviceError } from '../../../packages/dsh-fund-research-runtime/contract.js'
import { createMarketClient } from './market-mcp.js'
import { POLICY, chinaDate, quoteQuality } from './policy.js'
import { projectAnalysis, projectCatalog } from './projection.js'
import { createYingmiFundProvider } from '../../../packages/dsh-fund-research-runtime/yingmi-provider.js'
import { createYingmiResearchProvider } from '../../../packages/dsh-fund-research-runtime/yingmi-research-provider.js'
import { validateServiceQuery } from '../../../packages/dsh-fund-research-runtime/research-operations.js'
import { financialHash, validateFinancialQuery, validateFinancialResult, businessText, LIMITATIONS } from '../../../packages/dsh-fund-research-runtime/financial-contract.js'

const nowIso = clock => clock().toISOString()
const numeric = v => typeof v === 'number' && Number.isFinite(v)
const epoch = v => numeric(v) && v >= 946656000000 && v < 4102416000000
const safeTime = v => epoch(v) ? new Date(v).toISOString() : null
const issue = reason => Object.assign(new Error('Financial data unavailable.'), { reason })
const fallbackAllowed = error => POLICY.fallbackReasons.includes(error?.reason)
const marketErrors = { TIMEOUT:'network_timeout', UNAVAILABLE:'network_timeout', AUTH_DENIED:'auth', RATE_LIMITED:'quota', CANCELLED:'cancelled' }

export function createFinancialRouter({ env = {}, clock = () => new Date(), fetchImpl = globalThis.fetch, market, fund, operations } = {}) {
  const marketClient = market ?? createMarketClient({ resolveCredential: async () => env.TONGHUASHUN_API_KEY,
    fetchImpl: (url, init) => fetchImpl(url, { ...init, redirect: 'manual' }), timeoutMs: 18000 })
  const available = { tonghuashun: Boolean(market || env.TONGHUASHUN_API_KEY?.trim()), yingmi: Boolean(fund || env.YINGMI_API_KEY?.trim()) }

  async function fundCall(query, signal) {
    let reason
    const remember = next => { if (!['auth','quota','invalid'].includes(reason)) reason = next }
    const trackedFetch = async (url, init) => {
      let response
      try { response = await fetchImpl(url, { ...init, redirect: 'manual' }) }
      catch { remember('network_timeout'); throw issue(reason) }
      if ([401,403].includes(response.status)) remember('auth')
      else if (response.status === 429) remember('quota')
      else if (response.status >= 500) remember('upstream_5xx')
      else if (!response.ok) remember('invalid')
      return response
    }
    const provider = fund ?? createYingmiFundProvider({ resolveCredential: async () => env.YINGMI_API_KEY,
      fetch: trackedFetch, clock, onDataGap: () => remember('missing'), timeoutMs: 28000, requestTimeoutMs: 12000 })
    try { return await provider.research(query, { signal }) }
    catch (error) { throw issue(signal?.aborted ? 'cancelled' : reason ?? error.reason ?? 'unconfirmed') }
  }
  async function operationCall(query, signal) {
    const provider = operations ?? createYingmiResearchProvider({ resolveCredential: async () => env.YINGMI_API_KEY,
      fetch: (url, init) => fetchImpl(url, { ...init, redirect: 'manual' }), clock })
    return provider.researchOperation(validateServiceQuery(query), { signal })
  }
  async function marketCall(service, tool, args, signal) {
    if (!available.tonghuashun) throw issue('unsupported')
    try { return await marketClient.call(service, tool, args, { signal }) }
    catch (error) { throw issue(signal?.aborted ? 'cancelled' : marketErrors[error.code] ?? 'unconfirmed') }
  }

  return Object.freeze({
    async query(input, { signal } = {}) {
      const q = validateFinancialQuery(input)
      signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(65000)]) : AbortSignal.timeout(65000)
      const result = { schema_version:'financial-1', request_hash:financialHash(q), received_at:nowIso(clock), status:'complete', records:[], limitations:[] }
      const provenance = []
      let recordBytes = 0
      const evidencePrefix = crypto.randomUUID().replaceAll('-', '').slice(0,24)
      const limit = code => { if (!result.limitations.includes(LIMITATIONS[code])) result.limitations.push(LIMITATIONS[code]) }
      const add = (record, source, raw) => {
        if (result.records.length >= 150) { limit('truncated'); return }
        const evidence_id = `${evidencePrefix}${result.records.length.toString(16).padStart(8,'0')}`
        const row = { evidence_id, ...record }
        const bytes = Buffer.byteLength(JSON.stringify(row))
        if (recordBytes + bytes > 48 * 1024) { limit('truncated'); return }
        recordBytes += bytes
        result.records.push(row)
        provenance.push({ evidence_id, source, data_hash: financialHash(raw), as_of: record.as_of, received_at: nowIso(clock) })
      }
      const gap = (code = 'unsupported') => { result.status = code === 'unsupported' ? 'unsupported' : 'unavailable'; limit(code) }
      const qualityNote = quality => {
        if (quality === 'delayed') limit('delayed')
        if (quality === 'unknown') limit('freshness_unknown')
        if (quality === 'market_closed') limit('closed')
        if (quality === 'unconfirmed') limit('unconfirmed')
      }
      const datedQuality = date => !date ? 'unknown' : q.as_of && date < q.as_of ? 'delayed' : q.as_of && date > q.as_of ? 'unconfirmed' : 'unknown'
      const projectFund = (value, intent) => {
        const selected = intent === 'nav' ? value.evidence.filter(e => e.field === 'unit_nav') : value.evidence
        if (!selected.length) throw issue('missing')
        return selected.map(e => {
          const subject = value.subjects.find(s => s.fund_code === e.subject_code)
          if (!subject || subject.currency !== 'CNY' || !q.symbols.some(code => code.slice(0,6) === e.subject_code)) throw issue('unconfirmed')
          return { instrument: q.asset === 'etf' ? q.symbols[0] : e.subject_code, name: subject.fund_name,
            metric:e.label, value:e.value, unit:e.unit ?? '原始单位', as_of:e.as_of,
            price_basis:e.field === 'unit_nav' ? '单位净值' : e.field === 'accumulated_nav' ? '累计净值' : '基金披露数据',
            quality_state:value.quality_state === 'stale' ? 'delayed' : datedQuality(e.as_of), ...(e.dimensions ? { dimensions:e.dimensions } : {}),
            ...(e.period_start ? { period_start:e.period_start } : {}), ...(e.period_end ? { period_end:e.period_end } : {}) }
        })
      }
      let identityPromise
      const verifyFundIdentity = () => {
        if (!identityPromise) identityPromise = (async () => {
          if (!available.tonghuashun) throw issue('unconfirmed')
          const code = q.symbols[0]
          const thscode = q.asset === 'fund' ? `${code}.OF` : code
          const asset_type = q.asset === 'etf' ? 'fund-etf' : 'fund-otc'
          const identity = await marketCall('meta','get_meta_tickers_search',{q:thscode,asset_type,limit:10},signal)
          const matches = identity.data?.item?.filter(r => r.thscode === thscode)
          if (matches?.length !== 1 || matches[0].currency !== 'CNY' || matches[0].asset_type !== asset_type) throw issue('unconfirmed')
        })()
        return identityPromise
      }
      const fallbackFund = async () => {
        const code = q.symbols[0]
        // Only an exact listed ETF or an exact six-digit OTC share class is eligible.
        if (!(q.asset === 'etf' && /^\d{6}\.(SH|SZ)$/.test(code)) && !(q.asset === 'fund' && /^\d{6}$/.test(code))) throw issue('unsupported')
        const thscode = q.asset === 'fund' ? `${code}.OF` : code
        const fund_type = q.asset === 'fund' ? 'otc' : 'exchange'
        await verifyFundIdentity()
        const tool = q.intent === 'nav' ? 'get_fund_performance_nav' : 'get_fund_profile_detail'
        const raw = await marketCall('fund', tool, { fund_type, thscode, ...(q.intent === 'nav' ? { nav_type:q.nav_basis === 'adjusted' ? 'adj' : 'unit' } : {}) }, signal)
        const items = raw.data?.item
        if (!Array.isArray(items) || items.length !== 1) throw issue(items?.length === 0 ? 'missing' : 'unconfirmed')
        const row = items[0]
        if (row.thscode !== undefined && row.thscode !== thscode) throw issue('unconfirmed')
        if (q.intent === 'nav') {
          const date = epoch(row.nav_date) ? chinaDate(row.nav_date) : null
          const number = row[q.nav_basis === 'adjusted' ? 'adj_nav' : 'unit_nav']
          if (!date || !numeric(number) || number <= 0) throw issue('missing')
          return { raw, rows:[{ instrument:code, metric:q.nav_basis === 'adjusted' ? '复权净值' : '单位净值', value:number,
            unit:'CNY', as_of:date, price_basis:q.nav_basis === 'adjusted' ? '复权净值' : '单位净值', quality_state:datedQuality(date) }] }
        }
        if (row.thscode !== thscode || !businessText(row.fund_name)) throw issue('unconfirmed')
        const rows = [{ instrument:code, name:row.fund_name, metric:'基金名称', value:row.fund_name, unit:'text', as_of:null, price_basis:'基金资料', quality_state:'unknown' }]
        if (epoch(row.estab_date)) rows.push({ instrument:code, metric:'成立日期', value:chinaDate(row.estab_date), unit:'date', as_of:chinaDate(row.estab_date), price_basis:'基金资料', quality_state:'dated' })
        return { raw, rows }
      }
      try {
        if (signal?.aborted) throw issue('cancelled')
        let primary
        try { primary = await tushareFinancial(q,env,fetchImpl,signal) } catch { if(signal.aborted)throw issue('cancelled') }
        if (primary) {
          for(const row of primary.rows) { add(row,'tushare',primary.raw);qualityNote(row.quality_state) }
          if(primary.truncated)limit('truncated')
        } else if (q.intent === 'quote' || q.intent === 'history') {
          if (!POLICY.quote[q.asset] || !available.tonghuashun || (q.intent === 'history' &&
              (!POLICY.history[q.asset]?.includes(q.interval) || (q.asset !== 'stock' && q.adjustment !== 'none')))) gap()
          else if (q.intent === 'quote') {
            // A batch timestamp is the newest constituent time; request each instrument separately.
            const jobs = await Promise.allSettled([
              marketCall('a-share','get_a_share_calendar_trading_days',{},signal),
              ...q.symbols.map(thscode => marketCall(POLICY.quote[q.asset], q.asset === 'etf' ? 'get_fund_market_snapshot' : q.asset === 'index' ? 'get_a_share_index_prices_snapshot' : 'get_a_share_prices_snapshot',
                q.asset === 'etf' ? { thscode } : { thscodes:thscode,limit:1 },signal))
            ])
            const calendar = jobs[0].status === 'fulfilled' ? jobs[0].value.data : null
            for (let i=0; i<q.symbols.length; i++) {
              const job = jobs[i+1], code = q.symbols[i]
              if (job.status !== 'fulfilled') { limit('missing'); continue }
              const raw = job.value, items = raw.data?.item
              if (!Array.isArray(items) || items.length !== 1 || items[0].thscode !== code || !numeric(items[0].last_price) || items[0].last_price <= 0) { limit('missing'); continue }
              const row = items[0], as_of = safeTime(raw.data.timestamp)
              const quality_state = quoteQuality(raw.data.timestamp, calendar, clock().valueOf())
              const metrics = [['last_price','最新价',q.asset === 'index' ? '点' : 'CNY'],['price_change_ratio_pct','涨跌幅','%'],['open_price','开盘价',q.asset === 'index' ? '点' : 'CNY'],['high_price','最高价',q.asset === 'index' ? '点' : 'CNY'],['low_price','最低价',q.asset === 'index' ? '点' : 'CNY'],['turnover','成交额','CNY']]
              if (q.asset === 'stock') metrics.push(['volume','成交量','股'])
              for (const [field,metric,unit] of metrics) if (numeric(row[field])) add({ instrument:code,metric,value:row[field],unit,as_of,price_basis:q.asset === 'index' ? '指数点位' : '交易价格',quality_state },'tonghuashun',raw.data)
              qualityNote(quality_state)
            }
          } else {
            const thscode = q.symbols[0]
            const args = { thscode,start:Date.parse(`${q.start}T00:00:00+08:00`),end:Date.parse(`${q.end}T23:59:59+08:00`),interval:q.interval,...(q.asset === 'stock' ? {adjust:q.adjustment} : {}) }
            const tool = q.asset === 'etf' ? 'get_fund_market_historical' : q.asset === 'index' ? 'get_a_share_index_prices_historical' : 'get_a_share_prices_historical'
            const raw = await marketCall(POLICY.quote[q.asset],tool,args,signal)
            if (raw.data.thscode !== thscode || raw.data.interval !== q.interval || (q.asset === 'stock' && raw.data.adjust !== q.adjustment) || !Array.isArray(raw.data.item)) throw issue('unconfirmed')
            const dates = new Set()
            for (const row of raw.data.item) {
              const date = epoch(row.date_ms) ? chinaDate(row.date_ms) : null
              if (!date || date < q.start || date > q.end || dates.has(date)) throw issue('unconfirmed')
              dates.add(date)
              if (![row.open_price,row.high_price,row.low_price,row.close_price].every(v => numeric(v) && v > 0) || row.low_price > Math.min(row.open_price,row.close_price) || row.high_price < Math.max(row.open_price,row.close_price)) throw issue('unconfirmed')
            }
            const bars = [...raw.data.item].sort((a,b) => a.date_ms-b.date_ms)
            if (bars.length > 35) limit('truncated')
            for (const row of bars.slice(-35)) {
              const date = chinaDate(row.date_ms)
              for (const [field,metric] of [['open_price','开盘价'],['high_price','最高价'],['low_price','最低价'],['close_price','收盘价']]) add({instrument:thscode,metric,value:row[field],unit:q.asset === 'index' ? '点' : 'CNY',as_of:date,price_basis:`${q.interval} ${q.adjustment === 'forward' ? '前复权' : q.adjustment === 'backward' ? '后复权' : '不复权'}`,quality_state:'dated'},'tonghuashun',raw.data)
            }
          }
        } else if (q.intent === 'nav' || q.intent === 'profile') {
          if (!['fund','etf'].includes(q.asset) || (q.intent === 'nav' && !POLICY.nav[q.nav_basis])) gap()
          else {
            let candidate
            const routes = q.intent === 'nav' ? POLICY.nav[q.nav_basis] : POLICY.profile
            const needsFresh = value => q.intent === 'nav' && (value.rows.some(r => r.quality_state === 'delayed') || (q.as_of && value.rows.some(r => r.as_of !== q.as_of)))
            const better = next => !candidate || (q.as_of ? next.rows.every(r => r.as_of === q.as_of) : next.rows[0].as_of > candidate.rows[0].as_of)
            let attempts = 0
            for (const source of routes) {
              if (!available[source]) continue
              if (++attempts > POLICY.maxSwitches + 1) break
              try {
                let next
                if (source === 'yingmi') {
                  const primary = await fundCall({task:'single',funds:[q.symbols[0].slice(0,6)]},signal)
                  if (q.asset === 'etf') await verifyFundIdentity()
                  next = {rows:projectFund(primary,q.intent),raw:primary,source}
                } else next = {...await fallbackFund(),source}
                if (better(next)) candidate = next
                if (!needsFresh(candidate)) break
              } catch (error) {
                if (!fallbackAllowed(error)) {
                  if (!candidate) throw error
                  break
                }
              }
            }
            if (!candidate) gap()
            else { for (const r of candidate.rows) { add(r,candidate.source,candidate.raw);qualityNote(r.quality_state) } }
          }
        } else if (q.intent === 'research') {
          if (!available.yingmi) gap()
          else {
            const value = await fundCall({ task:q.task,funds:q.symbols,...(q.lookback_days !== undefined ? {lookback_days:q.lookback_days} : {}) },signal)
            for (const row of projectFund(value,'research')) { add(row,'yingmi',value);qualityNote(row.quality_state) }
            if (value.limitations.length) limit('missing')
          }
        } else if (q.intent === 'resolve') {
          if (q.asset === 'fund' && available.yingmi) {
            // Resolve against live schemas; no guessed parameter names or unreviewed tools.
            const catalog = await operationCall({operation:'catalog',capability:'search_funds'},signal)
            const e = catalog.entries[0]
            const schema = e.arguments_schema_json ? JSON.parse(e.arguments_schema_json) : null
            const key = ['keyword','query','keywords','fundName'].find(k => schema?.properties?.[k]?.type === 'string')
            if (e.state === 'available' && key && (schema.required ?? []).every(k => k === key)) {
              const value = await operationCall({operation:'execute',capability:'search_funds',schema_hash:e.schema_hash,arguments:{[key]:q.query}},signal)
              projectAnalysis(JSON.parse(value.data_json), r => add(r,'yingmi',value))
            }
          }
          if (!result.records.length && available.tonghuashun) {
            const type = {stock:'a-share',index:'a-share-index',etf:'fund-etf',fund:'fund-otc'}[q.asset]
            const raw = await marketCall('meta','get_meta_tickers_search',{q:q.query,asset_type:type,limit:10},signal)
            for (const row of raw.data?.item ?? []) {
              if (row.asset_type !== type || !/^\d{6}\.(SH|SZ|BJ|OF)$/.test(row.thscode) || !businessText(row.name)) continue
              const code = q.asset === 'fund' ? row.thscode.slice(0,6) : row.thscode
              add({instrument:code,name:row.name,metric:'证券名称',value:row.name,unit:'text',as_of:null,price_basis:'名称与代码',quality_state:'unknown'},'tonghuashun',raw.data)
            }
          }
          if (new Set(result.records.map(r => r.instrument)).size > 1) { result.status = 'ambiguous';limit('ambiguous') }
        } else if (q.intent === 'catalog' || q.intent === 'analysis') {
          if (!available.yingmi && !operations) gap()
          else if (q.intent === 'catalog') {
            const value = await operationCall({operation:'catalog',...(q.capability ? {capability:q.capability} : {})},signal)
            result.catalog = projectCatalog(value)
          } else {
            let args
            try { args = JSON.parse(q.arguments_json) } catch { throw issue('invalid') }
            const value = await operationCall({operation:'execute',capability:q.capability,schema_hash:q.schema_hash,arguments:args},signal)
            const projected = projectAnalysis(JSON.parse(value.data_json),r => add(r,'yingmi',value))
            limit('unverified')
            if (projected.omitted) limit('missing')
          }
        }
      } catch (error) {
        if (['RESEARCH_ARGUMENTS_INVALID','RESEARCH_SCHEMA_CHANGED','RESEARCH_RESULT_TOO_LARGE','RESEARCH_SCHEMA_UNSUPPORTED','RESEARCH_CAPABILITY_UNAVAILABLE','RESEARCH_QUERY_FAILED'].includes(error.code)) throw serviceError(error.code)
        // Raw provider errors, parameters, endpoints and credentials never enter product output.
        result.records = []
        provenance.length = 0
        gap(error.reason === 'unsupported' ? 'unsupported' : error.reason === 'unconfirmed' ? 'unconfirmed' : 'unavailable')
      }
      if (!result.records.length && !result.catalog && result.status === 'complete') gap('missing')
      if (new Set(result.records.filter(r => r.as_of).map(r => r.as_of)).size > 1 && ['nav','quote','research'].includes(q.intent)) limit('dates_differ')
      if (result.status === 'complete' && result.limitations.length) result.status = 'partial'
      result.received_at = nowIso(clock)
      return { value:validateFinancialResult(result,q,clock), provenance }
    }
  })
}
