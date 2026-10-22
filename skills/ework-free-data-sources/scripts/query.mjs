import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DIRECTORY = JSON.parse(readFileSync(new URL('../references/sources.json', import.meta.url), 'utf8'));
const UA = 'EWorkOdyssey/1.1 (https://github.com/awake-ai-lab/sherlock-desktop)';
const MAX_BYTES = 3_000_000;
const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim().slice(0, 1200) : '';
// DOI suffixes may contain parentheses. Encode path segments so links survive
// the native table's Markdown syntax without changing the DOI's identity.
const doiLink = value => typeof value === 'string' && value ? `https://doi.org/${value.split('/').map(part => encodeURIComponent(part).replace(/[()]/g, char => `%${char.charCodeAt(0).toString(16)}`)).join('/')}` : null;
export class PublicDataError extends Error {
  constructor(code, message, retryAfterSeconds) { super(message); this.name = 'PublicDataError'; this.code = code; if (retryAfterSeconds) this.retryAfterSeconds = retryAfterSeconds; }
}
const fail = message => { throw new PublicDataError('INVALID_PARAMETERS', message); };
function token(p, name, pattern, fallback) { const v = p[name] ?? fallback; if (typeof v !== 'string' || !pattern.test(v)) fail(`参数 ${name} 无效`); return v; }
function integer(p, name, min, max, fallback) { const v = p[name] ?? fallback; if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail(`参数 ${name} 必须为 ${min}–${max} 的整数`); return v; }
function coordinate(p, name, min, max) { const v = p[name]; if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`参数 ${name} 无效`); return v.toFixed(4); }
function text(p, name, min = 1) { const v = p[name]; if (typeof v !== 'string' || v.trim().length < min || v.length > 200 || /[\x00-\x1f]/.test(v)) fail(`参数 ${name} 需要 ${min}–200 字符`); return v.trim(); }
function url(base, values) { const u = new URL(base); for (const [k, v] of Object.entries(values)) u.searchParams.set(k, String(v)); return u.href; }
function latest(records) { return records.map(r => r.time).filter(Boolean).sort().at(-1) ?? null; }
function csv(body) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') { if (quoted && body[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift() ?? []; return rows.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
const WB_UNITS = { 'NY.GDP.MKTP.CD': 'current USD', 'NY.GDP.PCAP.CD': 'current USD/person', 'SP.POP.TOTL': 'persons', 'FP.CPI.TOTL.ZG': '% per year', 'NY.GDP.MKTP.KD.ZG': '% per year', 'SL.UEM.TOTL.ZS': '% of labor force' };
const chineseIndex = symbol => /^(?:sh000\d{3}|sz399\d{3})$/.test(symbol);
const quoteUnit = symbol => chineseIndex(symbol) ? 'points' : symbol.startsWith('hk') ? 'HKD' : symbol.startsWith('us') ? 'USD' : 'CNY';
export function catalog(category) {
  if (category !== undefined && (typeof category !== 'string' || category.length > 40)) fail('类别无效');
  return structuredClone({ ...DIRECTORY, sources: DIRECTORY.sources.filter(s => !category || s.category === category || s.categories?.includes(category)) });
}
export function prepareRequest(sourceId, p = {}) {
  const source = DIRECTORY.sources.find(s => s.id === sourceId);
  if (!source) throw new PublicDataError('UNKNOWN_SOURCE', '来源不在内置目录中，请先查询 catalog');
  if (!source.queryable || !source.defaultEligible) throw new PublicDataError('SOURCE_REQUIRES_SETUP', `该来源需要先核对接入条件：${source.limitations}`);
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !Object.hasOwn(source.parameters, k))) fail('存在不支持的参数；禁止传入任意URL、密钥或请求头');
  let endpoint, normalize, headers = { 'user-agent': UA, accept: 'application/json' };
  const limit = Object.hasOwn(source.parameters, 'limit') ? integer(p, 'limit', 1, 100, sourceId === 'coinbase-candles' ? 30 : 20) : 100;
  if (sourceId === 'world-bank') {
    const country = token(p, 'country', /^[A-Z]{3}$/), indicator = token(p, 'indicator', /^[A-Z0-9.]{3,60}$/);
    const year = new Date().getUTCFullYear(), start = integer(p, 'start', 1900, year, year - 6), end = integer(p, 'end', start, year, year);
    if (end - start > 30) fail('最多查询30年的指标');
    endpoint = url(`https://api.worldbank.org/v2/country/${country}/indicator/${indicator}`, { format: 'json', date: `${start}:${end}`, per_page: 100 });
    normalize = data => { if (!Array.isArray(data?.[1])) throw Error('invalid indicators'); const records = data[1].map(r => ({ country: r.country?.value, countryCode: r.countryiso3code, indicator: r.indicator?.value, indicatorCode: r.indicator?.id, time: String(r.date), value: num(r.value) })).sort((a, b) => a.time.localeCompare(b.time)); return { records, units: { value: WB_UNITS[indicator] ?? '来源未提供单位，先核对指标元数据' }, dataTime: latest(records.filter(r => r.value !== null)), releasedAt: data[0]?.lastupdated ?? null }; };
  } else if (sourceId === 'ecb-fx') {
    const currency = token(p, 'currency', /^[A-Z]{3}$/); if (currency === 'EUR') fail('基准已是EUR，请选择报价货币');
    endpoint = url(`https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A`, { format: 'csvdata', lastNObservations: limit }); headers.accept = 'text/csv';
    normalize = body => { const records = csv(body).map(r => ({ time: r.TIME_PERIOD, value: num(r.OBS_VALUE), currency: r.CURRENCY, base: r.CURRENCY_DENOM, status: r.OBS_STATUS })).sort((a, b) => a.time.localeCompare(b.time)); if (!records.length) throw Error('no exchange rates'); return { records, units: { value: `${currency} per EUR` }, dataTime: latest(records) }; };
  } else if (sourceId.startsWith('kraken-')) {
    const pair = token(p, 'pair', /^[A-Z0-9]{5,14}$/), candle = sourceId === 'kraken-candles';
    const interval = candle ? integer(p, 'interval', 1, 21600, 1440) : null;
    if (candle && ![1,5,15,30,60,240,1440,10080,21600].includes(interval)) fail('不支持的K线粒度');
    endpoint = url(`https://api.kraken.com/0/public/${candle ? 'OHLC' : 'Ticker'}`, { pair, ...(candle ? { interval } : {}) });
    normalize = d => {
      if (d.error?.length || !d.result) throw Error('kraken failed');
      const key = Object.keys(d.result).find(k => k !== 'last'), values = d.result[key]; if (!values) throw Error('no pair');
      const price = num(values.c?.[0]), openToday = num(values.o);
      // Kraken's opening price is midnight UTC, not a rolling 24-hour price.
      // Keep the raw calculation and an explicit display fallback together so
      // a missing opening price never turns into a fabricated zero change.
      const changePercentToday = price !== null && openToday !== null && openToday > 0 ? (price - openToday) / openToday * 100 : null;
      const changeTodayDetail = changePercentToday !== null && Number.isFinite(changePercentToday)
        ? `日内涨跌幅 ${changePercentToday.toFixed(2)}%（UTC 00:00 起）` : '日内涨跌幅：来源未提供有效UTC开盘价';
      const records = candle ? values.slice(-limit).map(r => ({ time: new Date(r[0] * 1000).toISOString(), open: num(r[1]), high: num(r[2]), low: num(r[3]), close: num(r[4]), volume: num(r[6]), trades: num(r[7]), pair: key })) : [{ pair: key, price, bid: num(values.b?.[0]), ask: num(values.a?.[0]), volume24h: num(values.v?.[1]), high24h: num(values.h?.[1]), low24h: num(values.l?.[1]), openToday, changePercentToday: Number.isFinite(changePercentToday) ? changePercentToday : null, changeTodayDetail, time: null }];
      if (!records.length || (candle ? records.some(r => r.close === null) : records[0].price === null)) throw Error('no valid price');
      const quoteUnit = { XBTUSD: 'USD', ETHUSD: 'USD', XBTEUR: 'EUR', ETHEUR: 'EUR', XBTUSDT: 'USDT', ETHUSDT: 'USDT' }[pair] ?? 'pair报价货币（来源未提供独立币种）', baseUnit = pair.startsWith('XBT') ? 'BTC' : pair.startsWith('ETH') ? 'ETH' : 'pair基础资产（来源未提供独立币种）';
      return { records, units: { price: quoteUnit, open: quoteUnit, high: quoteUnit, low: quoteUnit, close: quoteUnit, volume: baseUnit, volume24h: baseUnit, ...(!candle ? { openToday: quoteUnit, changePercentToday: '%' } : {}) }, dataTime: candle ? latest(records) : null, ...(candle ? { granularitySeconds: interval * 60, note: '最后一根可能尚未收盘' } : { timeMeaning: '报价时点未提供；receivedAt仅为获取时间；openToday为UTC 00:00开盘价，changePercentToday=(price-openToday)/openToday×100，不是滚动24h涨跌幅' }) };
    };
  } else if (sourceId.startsWith('coinbase-')) {
    const product = token(p, 'product', /^[A-Z0-9]{2,12}-[A-Z0-9]{2,12}$/), [base, quote] = product.split('-');
    const candle = sourceId === 'coinbase-candles';
    const granularity = candle ? integer(p, 'granularity', 60, 86400, 86400) : null;
    if (candle && ![60, 300, 900, 3600, 21600, 86400].includes(granularity)) fail('不支持的K线粒度');
    endpoint = url(`https://api.exchange.coinbase.com/products/${product}/${candle ? 'candles' : 'ticker'}`, candle ? { granularity } : {});
    normalize = data => {
      const records = candle ? data.filter(r => Array.isArray(r) && r.length >= 6).sort((a, b) => a[0] - b[0]).slice(-limit).map(r => ({ time: new Date(r[0] * 1000).toISOString(), low: num(r[1]), high: num(r[2]), open: num(r[3]), close: num(r[4]), volume: num(r[5]), product })) : [{ product, price: num(data.price), bid: num(data.bid), ask: num(data.ask), volume: num(data.volume), time: data.time ?? null }];
      if (!records.length || (candle ? records.some(r => r.close === null) : records[0].price === null)) throw Error('no price');
      return { records, units: { price: quote, open: quote, high: quote, low: quote, close: quote, volume: base }, dataTime: latest(records), ...(candle ? { granularitySeconds: granularity, note: '最后一根可能尚未收盘；源可能省略无成交区间' } : {}) };
    };
  } else if (sourceId === 'met-weather') {
    endpoint = url('https://api.met.no/weatherapi/locationforecast/2.0/compact', { lat: coordinate(p, 'lat', -90, 90), lon: coordinate(p, 'lon', -180, 180) });
    normalize = (data, receivedMs = Date.now()) => ({ records: data.properties.timeseries.filter(r => Date.parse(r.time) >= receivedMs).slice(0, limit).map(r => ({ time: r.time, ...r.data.instant.details, condition: r.data.next_1_hours?.summary?.symbol_code ?? null })), units: data.properties.meta.units, dataTime: data.properties.meta.updated_at, timeMeaning: 'dataTime为预报发布时间；records.time为预报有效时间，仅保留获取时点之后的实际预报时点，间隔以来源为准，不等于小时数' });
  } else if (sourceId === 'usgs-earthquakes') {
    const magnitude = p.minMagnitude ?? 2.5; if (typeof magnitude !== 'number' || !Number.isFinite(magnitude) || magnitude < -2 || magnitude > 10) fail('minMagnitude无效');
    const end = new Date(), start = new Date(end.getTime() - 86400000);
    endpoint = url('https://earthquake.usgs.gov/fdsnws/event/1/query', { format: 'geojson', starttime: start.toISOString(), endtime: end.toISOString(), minmagnitude: magnitude, limit, orderby: 'time' });
    normalize = data => { const records = data.features.map(f => ({ id: f.id, time: new Date(f.properties.time).toISOString(), magnitude: num(f.properties.mag), place: clean(f.properties.place), longitude: num(f.geometry?.coordinates?.[0]), latitude: num(f.geometry?.coordinates?.[1]), depth: num(f.geometry?.coordinates?.[2]), url: f.properties.url })); return { records, units: { magnitude: '源震级类型见USGS事件', depth: 'km', latitude: 'degree', longitude: 'degree' }, dataTime: latest(records), coverage: { start: start.toISOString(), end: end.toISOString() } }; };
  } else if (sourceId === 'crossref') {
    endpoint = url('https://api.crossref.org/works', { query: text(p, 'query'), rows: limit, select: 'DOI,title,author,published,publisher,URL,type' });
    normalize = data => ({ records: data.message.items.map(r => { const parts = r.published?.['date-parts']?.[0]; return { doi: r.DOI, title: clean(r.title?.[0]), authors: (r.author ?? []).map(a => clean([a.given, a.family].filter(Boolean).join(' '))).slice(0, 20), publisher: clean(r.publisher), url: doiLink(r.DOI), type: r.type, time: parts?.map((v, i) => String(v).padStart(i ? 2 : 4, '0')).join('-') ?? null }; }), units: {}, dataTime: null, timeMeaning: 'records.time为来源出版日期，可能只到年/月；无统一数据时点' });
  } else if (sourceId === 'github-repo') {
    const repo = token(p, 'repo', /^[A-Za-z0-9_.-]{1,80}\/[A-Za-z0-9_.-]{1,100}$/); endpoint = `https://api.github.com/repos/${repo}`;
    normalize = d => { if (typeof d.full_name !== 'string') throw Error('invalid repository'); return ({ records: [{ name: d.full_name, description: clean(d.description), stars: num(d.stargazers_count), forks: num(d.forks_count), openIssues: num(d.open_issues_count), language: d.language, url: d.html_url, time: d.updated_at, pushedAt: d.pushed_at, license: d.license?.spdx_id ?? null }], units: { stars: 'stars', forks: 'forks', openIssues: 'issues (包含PR)' }, dataTime: d.updated_at ?? null, timeMeaning: '仓库更新时间，不是计数的实测时间；计数为本次快照' }); };
  } else if (sourceId === 'npm-downloads') {
    const name = token(p, 'package', /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]{1,100}$/), period = token(p, 'period', /^last-(?:day|week|month)$/, 'last-week'); endpoint = `https://api.npmjs.org/downloads/point/${period}/${encodeURIComponent(name)}`;
    normalize = d => { if (num(d.downloads) === null) throw Error('missing downloads'); return { records: [{ package: d.package, downloads: num(d.downloads), start: d.start, end: d.end }], units: { downloads: 'download requests' }, dataTime: d.end }; };
  } else if (sourceId === 'gdelt-news') {
    endpoint = url('https://api.gdeltproject.org/api/v2/doc/doc', { query: text(p, 'query', 2), mode: 'artlist', format: 'json', maxrecords: limit, timespan: '1day', sort: 'datedesc' });
    normalize = d => { if (!Array.isArray(d.articles)) throw Error('invalid news'); return ({ records: d.articles.map(a => ({ title: clean(a.title), url: a.url, firstSeenAt: a.seendate, domain: a.domain, language: a.language, country: a.sourcecountry })), units: {}, dataTime: null, timeMeaning: 'firstSeenAt为GDELT索引首次发现时间，不是原文发布时间' }); };
  } else if (sourceId === 'tencent-quotes') {
    const symbols = p.symbols; if (!Array.isArray(symbols) || !symbols.length || symbols.length > 12 || symbols.some(s => typeof s !== 'string' || !/^(?:sh\d{6}|sz\d{6}|hk\d{5}|us[A-Z][A-Z0-9.]{0,9})$/.test(s))) fail('symbols必须为1–12个合规交易代码');
    endpoint = url('https://qt.gtimg.cn/', { q: symbols.join(',') }); headers.referer = 'https://gu.qq.com/';
    normalize = body => {
      const records = [...body.matchAll(/v_([A-Za-z0-9.]+)="([^"\r\n]*)"/g)].map(m => { const f = m[2].split('~'); const t = f[30]; return { symbol: m[1], name: clean(f[1]), code: f[2], price: num(f[3]), previousClose: num(f[4]), open: num(f[5]), change: num(f[31]), changePercent: num(f[32]), high: num(f[33]), low: num(f[34]), time: /^\d{14}$/.test(t ?? '') ? `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)} ${t.slice(8,10)}:${t.slice(10,12)}:${t.slice(12,14)}` : null, timezone: m[1].startsWith('us') ? '来源未确认时区' : 'Asia/Shanghai', priceUnit: quoteUnit(m[1]), currency: chineseIndex(m[1]) ? null : quoteUnit(m[1]) }; }).filter(r => symbols.includes(r.symbol) && r.price !== null && r.price > 0);
      if (!records.length) throw Error('no valid quotes'); return { records, units: { price: '各记录priceUnit；指数为points，证券为报价币种', changePercent: '%' }, dataTime: latest(records), missingSymbols: symbols.filter(s => !records.some(r => r.symbol === s)), timeMeaning: '各证券最后报价时间；不把获取时间当交易时间，不同市场不能共用时区' };
    };
  } else if (sourceId === 'tencent-history') {
    const symbol = token(p, 'symbol', /^(?:sh\d{6}|sz\d{6}|hk\d{5})$/); endpoint = url('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get', { param: `${symbol},day,,,${limit},` }); headers.referer = 'https://gu.qq.com/';
    normalize = d => { const bars = d.data?.[symbol]?.day; if (!Array.isArray(bars) || !bars.length) throw Error('missing candles'); const records = bars.slice(-limit).map(r => ({ time: r[0], open: num(r[1]), close: num(r[2]), high: num(r[3]), low: num(r[4]), volume: num(r[5]), symbol })); return { records, units: { price: quoteUnit(symbol), volume: '来源原始单位，未核实' }, dataTime: latest(records), adjustment: '不复权' }; };
  } else if (sourceId === 'sina-news') {
    endpoint = url('https://feed.mix.sina.com.cn/api/roll/get', { pageid: 384, lid: 2519, num: Math.min(limit, 50), page: 1 }); headers.referer = 'https://finance.sina.com.cn/';
    normalize = d => ({ records: d.result.data.slice(0, limit).map(r => ({ title: clean(r.title), url: r.url, publisher: clean(r.media_name), time: /^\d{10}$/.test(String(r.ctime)) ? new Date(Number(r.ctime) * 1000).toISOString() : null })), units: {}, dataTime: latest(d.result.data.map(r => ({ time: /^\d{10}$/.test(String(r.ctime)) ? new Date(Number(r.ctime) * 1000).toISOString() : null }))) });
  } else if (sourceId === 'eastmoney-announcements') {
    // A separate, bounded query per issuer avoids a combined first page being
    // dominated by one company and silently omitting the other requested ones.
    const symbol = token(p, 'symbol', /^(?:sh|sz|bj)\d{6}$/), code = symbol.slice(2);
    endpoint = url('https://np-anotice-stock.eastmoney.com/api/security/ann', { sr: -1, page_size: limit, page_index: 1, ann_type: 'A', stock_list: code });
    headers.referer = 'https://data.eastmoney.com/';
    normalize = d => {
      if (d?.success !== 1 || d.error || !Array.isArray(d.data?.list)) throw Error('invalid announcements');
      const records = d.data.list.slice(0, limit).map(row => {
        const issuer = row.codes?.find(issuer => issuer.stock_code === code);
        if (!issuer || !/^AN\d{12,24}$/.test(row.art_code ?? '') || typeof row.title !== 'string' || !row.title.trim()) throw Error('invalid announcement identity');
        const display = typeof row.display_time === 'string' && row.display_time.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?::(\d{3}))?$/);
        const displayed = display ? `${display[1]}T${display[2]}.${display[3] ?? '000'}+08:00` : null;
        const noticeDate = typeof row.notice_date === 'string' ? row.notice_date.match(/^\d{4}-\d{2}-\d{2}(?=$|\s)/)?.[0] ?? null : null;
        return { symbol, code, name: clean(issuer.short_name), title: clean(row.title),
          url: `https://data.eastmoney.com/notices/detail/${code}/${row.art_code}.html`,
          time: displayed && Number.isFinite(Date.parse(displayed)) ? displayed : null,
          displayTime: typeof row.display_time === 'string' ? row.display_time : null, noticeDate,
          publisher: `${clean(issuer.short_name)} · ${code}`, category: (row.columns ?? []).map(c => clean(c.column_name)).filter(Boolean).join(' · '), summary: null };
      });
      return { records, units: {}, dataTime: latest(records), coverage: { symbol, scope: 'first-page', requestedLimit: limit, returned: records.length },
        timeMeaning: 'time为东方财富列表display_time（Asia/Shanghai），不是交易所发布时点；noticeDate为原公告日期，可能次日，必须单独保留。仅首页，不代表区间全部公告；摘要未提供。' };
    };
  }
  if (!endpoint || !normalize) throw new PublicDataError('SOURCE_REQUIRES_SETUP', '该来源尚无内置适配器');
  return { source, endpoint, normalize, headers };
}

// One queue per provider, across all component callers. No arbitrary URLs,
// automatic redirects, credentials, or execution of remote instructions.
async function waitForTurn(promise, signal) {
  signal?.throwIfAborted();
  if (!signal) return promise;
  let abort; const aborted = new Promise((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([promise, aborted]); } finally { signal.removeEventListener('abort', abort); }
}
export function createQueryClient({ fetcher = globalThis.fetch, now = Date.now, timeoutMs = 20000 } = {}) {
  const cache = new Map(), queues = new Map(), lastCall = new Map(), cooldown = new Map(), unavailable = new Map();
  async function request(args, signal) {
    const { source, endpoint, normalize, headers } = prepareRequest(args.source, args.parameters ?? {});
    const providerId = new URL(endpoint).hostname;
    const key = `${source.id}:${endpoint}:${JSON.stringify(Object.entries(args.parameters ?? {}).sort(([a], [b]) => a.localeCompare(b)))}`, queued = queues.get(providerId) ?? Promise.resolve(); let release;
    const done = new Promise(r => { release = r; }); queues.set(providerId, queued.catch(() => {}).then(() => done));
    try {
      await waitForTurn(queued.catch(() => {}), signal); signal?.throwIfAborted();
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) return { ...structuredClone(hit.result), cacheHit: true, nextRefreshSeconds: Math.ceil((hit.expiresAt - now()) / 1000) };
      if ((cooldown.get(providerId) ?? 0) > now()) throw new PublicDataError('RATE_LIMITED', '来源暂时限流，请在退避期结束后再查询', Math.ceil((cooldown.get(providerId) - now()) / 1000));
      if ((unavailable.get(providerId) ?? 0) > now()) throw new PublicDataError('SOURCE_UNAVAILABLE', '来源最近一次连接失败，正在短暂退避；不要换词重试，可改用其他适用来源并如实保留缺失', Math.ceil((unavailable.get(providerId) - now()) / 1000));
      const spacing = source.id === 'github-repo' ? 60000 : source.id === 'crossref' ? 250 : 1000;
      const delay = (lastCall.get(providerId) ?? 0) + spacing - now();
      if (delay > 0) await new Promise((resolve, reject) => { const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delay); const abort = () => { clearTimeout(timer); reject(signal.reason); }; signal?.addEventListener('abort', abort, { once: true }); });
      signal?.throwIfAborted(); lastCall.set(providerId, now());
      const controller = new AbortController(), abort = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(new PublicDataError('TIMEOUT', '来源响应超时，请稍后重试或换用适用来源')), timeoutMs);
      try {
        const response = await fetcher(endpoint, { method: 'GET', headers, redirect: 'error', signal: controller.signal });
        if (!response.ok) {
          if (response.status === 429 || response.status === 403) {
            const retry = response.headers.get('retry-after'), reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
            const delay = Math.max(60000, /^[0-9]+$/.test(retry ?? '') ? Number(retry) * 1000 : Date.parse(retry ?? '') - now() || 0, Number.isFinite(reset) ? reset - now() : 0);
            cooldown.set(providerId, now() + Math.min(delay, 86400000)); throw new PublicDataError('RATE_LIMITED', '来源拒绝或限制请求，请稍后重试或换用适用来源', Math.ceil(delay / 1000));
          }
          throw new PublicDataError('SOURCE_UNAVAILABLE', `来源暂不可用（HTTP ${response.status}）`);
        }
        const chunks = []; let bytes = 0;
        for await (const chunk of response.body) { bytes += chunk.length; if (bytes > MAX_BYTES) { controller.abort(); throw new PublicDataError('RESPONSE_TOO_LARGE', '来源响应过大，请缩小查询范围'); } chunks.push(chunk); }
        const body = Buffer.concat(chunks), content = source.id === 'tencent-quotes' ? new TextDecoder('gb18030').decode(body) : body.toString('utf8');
        let normalized;
        try { normalized = normalize(source.id === 'ecb-fx' || source.id === 'tencent-quotes' ? content : JSON.parse(content), now()); }
        catch { throw new PublicDataError('INVALID_RESPONSE', '来源返回了无法核验的数据，请换用适用来源或稍后重试'); }
        if (!Array.isArray(normalized.records) || normalized.records.length > 100) throw new PublicDataError('INVALID_RESPONSE', '来源记录不符合数量约束');
        const expires = Date.parse(response.headers.get('expires') ?? ''), age = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 0);
        const ttl = Math.max(source.cacheSeconds, Number.isFinite(expires) ? (expires - now()) / 1000 : 0, age);
        const result = { version: 1, source: source.name, sourceId: source.id, sourceUrl: endpoint, documentation: source.documentation, ...normalized, receivedAt: new Date(now()).toISOString(), cacheHit: false, nextRefreshSeconds: Math.ceil(ttl), limitations: source.limitations, rights: source.rights, quality: normalized.records.length ? 'source-response' : 'empty-result', delivery: 'snapshot; no automatic component refresh binding' };
        cache.set(key, { result: structuredClone(result), expiresAt: now() + ttl * 1000 }); while (cache.size > 128) cache.delete(cache.keys().next().value);
        return result;
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        const failure = controller.signal.aborted && controller.signal.reason instanceof PublicDataError && error?.code !== 'RESPONSE_TOO_LARGE'
          ? controller.signal.reason : error instanceof PublicDataError ? error : new PublicDataError('NETWORK_ERROR', '无法连接来源，请检查网络或换用适用来源');
        // Connectivity failures affect the provider, not the search wording.
        // Keep valid cached records available and let another provider proceed.
        if (['NETWORK_ERROR','TIMEOUT'].includes(failure.code)) unavailable.set(providerId, now() + 60000);
        throw failure;
      }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    } finally { release(); }
  }
  return { query: request, clear: () => { cache.clear(); } };
}
export const queryClient = createQueryClient();
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const [operation, source, params] = process.argv.slice(2); const result = operation === 'catalog' ? catalog(source) : operation === 'query' ? await queryClient.query({ source, parameters: JSON.parse(params ?? '{}') }) : fail('使用 catalog [category] 或 query <source> <参数JSON>'); process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ code: error.code ?? 'ERROR', message: error.message, retryAfterSeconds: error.retryAfterSeconds }) + '\n'); process.exitCode = 1; }
}
