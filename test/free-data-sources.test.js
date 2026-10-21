import { build } from 'esbuild';
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { catalog, prepareRequest, createQueryClient } from '../skills/ework-free-data-sources/scripts/query.mjs';
import { createPublicDataTool, freeDataInstruction } from '../packages/dsh-research-task-runtime/public-data-tool.js';
import { createPublicDataClient } from '../packages/dsh-research-task-runtime/public-data-client.js';
import { buildResearchTaskPrompt, publicEventFromSessionEvent } from '../packages/dsh-research-task-runtime/index.js';
import { preferredComponentSourceTools, registerComponentSourceGuidance } from '../packages/dsh-research-task-runtime/component-source-tools.js';
import { loadBundledSkills, BUNDLED_FREE_DATA_SKILL_ID, isBundledSkillId } from '../src/main/integrations/bundled-skills';
const root = path.resolve(import.meta.dirname, '../skills');
const response = (body, options = {}) => new Response(JSON.stringify(body), options);
const quote = { price: '100.1', volume: '0', time: '2026-10-09T10:00:00Z', bid: '100', ask: '101' };
const request = prompt => ({ parentSessionId: 'p', canvasNodeId: 'n', kind: 'container', prompt });
describe('builtin free data sources', () => {
  it('validates desktop refresh against fixed eligible adapters before any network call', async () => {
    const query = vi.fn(async () => ({records:[]})), client = createPublicDataClient({moduleLoader:async()=>({prepareRequest,queryClient:{query}})});
    for (const args of [{operation:'catalog'}, {operation:'query',source:'nominatim-public',parameters_json:'{}'}, {operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD","url":"https://localhost"}'}, {operation:'query',source:'kraken-ticker',parameters_json:'[]'}]) await expect(client.query(args)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    const args={operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'};
    await expect(client.validate(args)).resolves.toMatchObject({sourceId:'kraken-ticker'});expect(query).not.toHaveBeenCalled();
    const signal=new AbortController().signal;await client.query(args,signal);expect(query).toHaveBeenCalledWith({source:'kraken-ticker',parameters:{pair:'XBTUSD'}},signal);
  });
  it('keeps tool/agent dependencies out of the production desktop artifact bundle', async () => {
    const bundle = await build({ entryPoints: ['packages/dsh-research-task-runtime/artifact-output.js'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true });
    expect(Object.keys(bundle.metafile.inputs).filter(file => /@deepseek-ai\/dsh-(tools|llm)\//.test(file))).toEqual([]);
    expect(bundle.outputFiles[0].text).not.toContain('createRequire(import.meta.url)("../package.json")');
  });
  it('is discovered by native filesystem and integration allowlist and protected as bundled', async () => {
    const provider = new FileSystemSkillProvider({ get: () => undefined, logger: { warn: vi.fn() } }, { signal: new AbortController().signal, invalidate: vi.fn() }, { includeDefaultRoots: false, bundledSkillDir: root, watch: false });
    try { const listed = await provider.list({}), candidate = (Array.isArray(listed) ? listed : listed.candidates).find(c => c.name === 'ework-free-data-sources'); expect(candidate.source).toBe('bundled'); expect((await provider.get(candidate, {})).content).toContain('public_data_query'); } finally { await provider.dispose(); }
    const entries = await loadBundledSkills(root); const item = entries.find(e => e.skill.id === BUNDLED_FREE_DATA_SKILL_ID); expect(item.skill).toMatchObject({ enabled: true, provider: 'bundled', source: 'EWork 内置 · v1.0.8' }); expect(isBundledSkillId(item.skill.id)).toBe(true);
  });
  it('only exposes adapters for eligible sources and never uses restricted/keyed providers', () => {
    expect(catalog().sources).toHaveLength(28); expect(catalog().sources.filter(s => s.queryable)).toHaveLength(16);
    for (const s of catalog().sources) { expect(s.documentation).toMatch(/^https:\/\//); if (s.defaultEligible) expect(() => prepareRequest(s.id, s.example)).not.toThrow(); }
    for (const id of ['fred','eia','open-meteo','nominatim-public','sec-edgar']) expect(() => prepareRequest(id)).toThrow(/条件/);
    expect(catalog('fx').sources.map(s => s.id)).toEqual(['ecb-fx']);
  });
  it.each([{ url: 'https://127.0.0.1/' }, { product: '../secret' }, { product: 'BTC-USD', api_key: 'secret' }, []])('rejects arbitrary URL, credentials and malformed args before networking: %o', async parameters => {
    const fetcher = vi.fn(), client = createQueryClient({ fetcher }); await expect(client.query({ source: 'coinbase-ticker', parameters })).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves null, zero, negatives, annual units and true data time', () => {
    const normalize = prepareRequest('world-bank', { country: 'CHN', indicator: 'NY.GDP.MKTP.KD.ZG', start: 2020, end: 2025 }).normalize;
    const data = normalize([{ lastupdated: '2026-10-08' }, [{ date: '2025', value: null }, { date: '2024', value: -1 }, { date: '2023', value: 0 }]]);
    expect(data.records.map(r => r.value)).toEqual([0, -1, null]); expect(data.dataTime).toBe('2024'); expect(data.releasedAt).toBe('2026-10-08'); expect(data.units.value).toBe('% per year');
  });
  it('parses quoted ECB csv and keeps daily reference currency direction', () => {
    const result = prepareRequest('ecb-fx', { currency: 'CNY' }).normalize('TIME_PERIOD,OBS_VALUE,CURRENCY,CURRENCY_DENOM,NOTE\n2026-10-09,7.7,CNY,EUR,"quoted, text"\n'); expect(result.records[0]).toMatchObject({ value: 7.7, base: 'EUR', currency: 'CNY' }); expect(result.units.value).toBe('CNY per EUR');
  });
  it('preserves DOI identities and complete native table links with parentheses', () => {
    const doi = '10.1016/s2212-0963(15)00040-6';
    const record = prepareRequest('crossref', { query: 'climate risk', limit: 8 }).normalize({ message: { items: [{ DOI: doi, title: ['Editorial Board'], published: { 'date-parts': [[2015]] } }] } }).records[0];
    expect(record.doi).toBe(doi); expect(record.url).toBe('https://doi.org/10.1016/s2212-0963%2815%2900040-6');
    const cell = `[${record.doi}](${record.url})`;
    expect(cell.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)?.[2]).toBe(record.url);
    expect(decodeURIComponent(new URL(record.url).pathname.slice(1))).toBe(doi);
    expect(record.authors).toEqual([]); expect(record.time).toBe('2015');
  });
  it('distinguishes Chinese index points from security currency in quotes and history', () => {
    const quote = symbol => { const fields = Array(40).fill(''); fields[1] = symbol; fields[3] = '4317.25'; fields[30] = '20261009161400'; return `v_${symbol}="${fields.join('~')}";`; };
    const data = prepareRequest('tencent-quotes', { symbols: ['sh000300','sh600519'] }).normalize(quote('sh000300') + quote('sh600519'));
    expect(data.records[0]).toMatchObject({ priceUnit: 'points', currency: null }); expect(data.records[1]).toMatchObject({ priceUnit: 'CNY', currency: 'CNY' });
    const history = prepareRequest('tencent-history', { symbol: 'sz399001' }).normalize({ data: { sz399001: { day: [['2026-10-09','1','2','3','1','100']] } } }); expect(history.units.price).toBe('points');
  });
  it('distinguishes weather publication and forecast times, and missing article publication', () => {
    const weather = prepareRequest('met-weather', { lat: 0, lon: 0 }).normalize({ properties: { meta: { updated_at: '2026-10-09T00:00:00Z', units: { air_temperature: 'celsius' } }, timeseries: [{ time: '2026-10-10T00:00:00Z', data: { instant: { details: { air_temperature: 0 } } } }] } }, Date.parse('2026-10-09T23:00:00Z')); expect(weather.dataTime).not.toBe(weather.records[0].time); expect(weather.records[0].air_temperature).toBe(0);
    const news = prepareRequest('gdelt-news', { query: 'climate' }).normalize({ articles: [{ title: 'title', seendate: '20261010T120000Z' }] }); expect(news.records[0]).toHaveProperty('firstSeenAt'); expect(news.dataTime).toBeNull(); expect(news.records[0]).not.toHaveProperty('time');
  });
  it('filters elapsed weather times before applying the requested count using the client clock', async () => {
    const at = Date.parse('2026-10-10T15:30:00Z');
    const timeseries = Array.from({ length: 36 }, (_, i) => ({ time: new Date(Date.parse('2026-10-10T07:00:00Z') + i * 3600000).toISOString(), data: { instant: { details: { air_temperature: i } } } }));
    const client = createQueryClient({ now: () => at, fetcher: async () => response({ properties: { meta: { updated_at: '2026-10-10T13:17:19Z', units: { air_temperature: 'celsius' } }, timeseries } }) });
    const result = await client.query({ source: 'met-weather', parameters: { lat: 31.23, lon: 121.47, limit: 24 } });
    expect(result.records).toHaveLength(24); expect(result.records[0].time).toBe('2026-10-10T16:00:00.000Z'); expect(result.records.every(r => Date.parse(r.time) >= at)).toBe(true); expect(result.dataTime).toBe('2026-10-10T13:17:19Z');
  });
  it('caches overlapping component calls, bounds TTL and keeps receivedAt distinct from dataTime', async () => {
    const fetcher = vi.fn(async () => response(quote)); const client = createQueryClient({ fetcher, now: () => Date.parse('2026-10-10T00:00:00Z') }); const args = { source: 'coinbase-ticker', parameters: { product: 'BTC-USD' } }; const [a, b] = await Promise.all([client.query(args), client.query(args)]); expect(fetcher).toHaveBeenCalledTimes(1); expect(b.cacheHit).toBe(true); expect(a.receivedAt).not.toBe(a.dataTime); expect(a.records[0].volume).toBe(0); expect(a.delivery).toContain('no automatic');
    b.records[0].price = 0; expect((await client.query(args)).records[0].price).toBe(100.1);
  });
  it('honors rate-limit backoff and never tries another provider or retries immediately', async () => {
    const fetcher = vi.fn(async () => response({}, { status: 429, headers: { 'retry-after': '120' } })); const client = createQueryClient({ fetcher }); const args = { source: 'coinbase-ticker', parameters: { product: 'BTC-USD' } }; await expect(client.query(args)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 120 }); await expect(client.query(args)).rejects.toMatchObject({ code: 'RATE_LIMITED' }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fast-fails changed queries to an unreachable provider, preserves other providers, and probes again after a short cooldown', async () => {
    let at=Date.parse('2026-10-21T06:00:00Z'),failed=true;
    const fetcher=vi.fn(async endpoint=>{if(endpoint.includes('gdeltproject')&&failed)throw new TypeError('network unavailable');return response(endpoint.includes('gdeltproject')?{articles:[{title:'Retrieved headline',url:'https://example.org/article'}]}:quote)});
    const client=createQueryClient({fetcher,now:()=>at}),query=text=>client.query({source:'gdelt-news',parameters:{query:text}});
    await expect(query('capacity price')).rejects.toMatchObject({code:'NETWORK_ERROR'});
    await expect(query('coal supply')).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE',retryAfterSeconds:60});
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.query({source:'coinbase-ticker',parameters:{product:'BTC-USD'}})).resolves.toMatchObject({records:[{price:100.1}]});
    at+=60001;failed=false;
    await expect(query('coal supply')).resolves.toMatchObject({records:[{title:'Retrieved headline'}]});
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not trip provider cooldown for invalid data, bad parameters, or a user cancellation', async () => {
    let at=Date.parse('2026-10-21T06:00:00Z');const abort=new AbortController();
    const fetcher=vi.fn(async()=>{if(fetcher.mock.calls.length===1){abort.abort(Error('user cancelled'));throw abort.signal.reason}return response({error:'invalid data'})});
    const client=createQueryClient({fetcher,now:()=>at}),args={source:'coinbase-ticker',parameters:{product:'BTC-USD'}};
    await expect(client.query(args,abort.signal)).rejects.toThrow('user cancelled');
    at+=1001;await expect(client.query(args)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    at+=1001;await expect(client.query({...args,parameters:{product:'ETH-USD'}})).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('lets queued calls observe a network failure without another request, and also backs off after a timeout',async()=>{
    let rejectRequest,started;const ready=new Promise(resolve=>{started=resolve});
    const fetcher=vi.fn(()=>new Promise((_resolve,reject)=>{rejectRequest=reject;started()})),client=createQueryClient({fetcher});
    const a=client.query({source:'gdelt-news',parameters:{query:'capacity price'}});await ready;
    const b=client.query({source:'gdelt-news',parameters:{query:'coal supply'}});rejectRequest(Error('offline'));
    await expect(a).rejects.toMatchObject({code:'NETWORK_ERROR'});await expect(b).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});expect(fetcher).toHaveBeenCalledTimes(1);
    const slow=vi.fn((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))),timeout=createQueryClient({fetcher:slow,timeoutMs:10});
    await expect(timeout.query({source:'gdelt-news',parameters:{query:'capacity price'}})).rejects.toMatchObject({code:'TIMEOUT'});
    await expect(timeout.query({source:'gdelt-news',parameters:{query:'coal supply'}})).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});expect(slow).toHaveBeenCalledTimes(1);
  });
  it('keeps previously verified cached data available during a provider connectivity cooldown',async()=>{
    let at=Date.parse('2026-10-21T06:00:00Z'),fail=false;const fetcher=vi.fn(async()=>{if(fail)throw Error('offline');return response(quote)}),client=createQueryClient({fetcher,now:()=>at});
    const args={source:'coinbase-ticker',parameters:{product:'ETH-USD'}};await client.query(args);at+=1001;fail=true;
    await expect(client.query({source:'coinbase-ticker',parameters:{product:'BTC-USD'}})).rejects.toMatchObject({code:'NETWORK_ERROR'});
    await expect(client.query(args)).resolves.toMatchObject({cacheHit:true,records:[{price:100.1}]});expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps different requested record counts separate even when the provider endpoint is identical', async () => {
    let at = Date.parse('2026-10-11T00:00:00Z');
    const fetcher = vi.fn(async () => response([[1,1,3,2,2,10],[2,1,3,2,2,20],[3,1,3,2,2,30]]));
    const client = createQueryClient({ fetcher, now: () => at });
    const query = limit => client.query({ source: 'coinbase-candles', parameters: { product: 'BTC-USD', granularity: 86400, limit } });
    expect((await query(2)).records).toHaveLength(2); at += 2000;
    expect((await query(3)).records).toHaveLength(3);
    expect((await query(2)).records).toHaveLength(2); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed response and cancels a request on timeout', async () => {
    await expect(createQueryClient({ fetcher: async () => response({ error: 'no data' }) }).query({ source: 'coinbase-ticker', parameters: { product: 'BTC-USD' } })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const fetcher = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); await expect(createQueryClient({ fetcher, timeoutMs: 10 }).query({ source: 'coinbase-ticker', parameters: { product: 'BTC-USD' } })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('keeps model tools read-only and validates JSON and operation', async () => {
    const api = { catalog, queryClient: { query: vi.fn(async () => ({ records: [] })) } }, tool = createPublicDataTool({ moduleLoader: async () => api }); const args = { operation: 'query', source: 'met-weather', parameters_json: '{"lat":31,"lon":121}' }; await tool.execute(args, {}); expect(api.queryClient.query).toHaveBeenCalledWith({ source: 'met-weather', parameters: { lat: 31, lon: 121 } }, undefined); await expect(tool.execute({ ...args, parameters_json: 'bad' }, {})).rejects.toThrow('JSON'); expect(tool.name).toBe('public_data_query');
  });
  it('prefers free sources by default but keeps explicitly selected plugin sources and offline evidence', () => {
    const schemas = [{ name: 'public_data_query' }, { name: 'ework__call', description: 'DataYes 数据' }]; expect(preferredComponentSourceTools(schemas, '股票最新行情')).toEqual([]); expect(preferredComponentSourceTools(schemas, '使用通联查询股票最新行情')).toHaveLength(1);
    expect(buildResearchTaskPrompt(request('请联网生成最新天气预报组件'))).toContain('先使用当前可见的 public_data_query');
    const offline = buildResearchTaskPrompt(request('不要联网，只用给定记录制作表格')); expect(offline).not.toContain('【EWork 内置免费数据源】');
    let registration; registerComponentSourceGuidance({ systemPrompt: { context: v => { registration = v; } }, tools: { schemas: () => schemas } }); expect(registration.name).toBe('sherlock:component-sources'); expect(freeDataInstruction()).toContain('不能称实时');
    expect(publicEventFromSessionEvent({ type: 'tool/call', data: { name: 'public_data_query', arguments: { source: 'met-weather' } } })).toMatchObject({ tool: '读取免费数据源', detail: 'met-weather' });
  });
  it('routes policy originals to official web sources rather than a generic rolling news feed',()=>{
    expect(freeDataInstruction()).toContain('政策、法规或部委通知优先');
    expect(freeDataInstruction()).toContain('不先遍历通用新闻源');
    expect(buildResearchTaskPrompt(request('检索煤电容量电价部委政策原文与行业动态'))).toContain('政策、法规或部委通知优先');
  });
});
