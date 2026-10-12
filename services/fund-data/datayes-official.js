import registry from '../../config/datayes-official-services.json' with { type: 'json' }

// This registry comes from the official plaza and MCP tools/list, not guessed
// API names. The request's URL is never used as a network destination.
const apis = new Map(registry.services.flatMap(service => service.apis.map(name => [name, service])))
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const error = text => ({ result: { isError: true, content: [{ type: 'text', text }] } })

function search(query) {
  if (typeof query !== 'string' || !query.trim()) return null
  const terms = new Set(query.toLowerCase().match(/[a-z][a-z0-9_]+/g) ?? [])
  for (const run of query.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2))
  }
  const candidates = [...apis].map(([name, service]) => ({ name,
    summary: service.apiDescriptions?.[name] ?? '', service }))
  const frequencies = new Map([...terms].map(term => [term, candidates.filter(api =>
    `${api.name} ${api.summary}`.toLowerCase().includes(term)).length]))
  const matches = candidates.map(api => ({ ...api, score: [...terms].reduce((sum, term) =>
    sum + (`${api.name} ${api.summary}`.toLowerCase().includes(term) ? 1 / (frequencies.get(term) || 1) : 0), 0) }))
    .filter(api => api.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 10)
  return matches.length ? { content: [{ type: 'text', text:
    '官网 MCP 积分服务的接口发现结果（这是接口目录，不是业务数据）。先用 get_api_info 获取实时参数，再调用 call_api 取数。\n' +
    matches.map(api => `${api.name} | ${api.summary} | ${api.service.name}`).join('\n') }] } : null
}

export function officialDatayesRoute(rpc) {
  if (rpc.method !== 'tools/call') return null
  const { name, arguments: args } = rpc.params
  if (name === 'search_api') {
    const result = search(args.query)
    return result ? { result } : null
  }
  if (!['get_api_info', 'call_api'].includes(name)) return null
  const service = apis.get(args.nameEn)
  if (!service) return null
  if (name === 'get_api_info') return { endpoint: service.url, service,
    params: { name: service.infoTool, arguments: { api_name: args.nameEn } }, definition: args.nameEn }
  let url
  try { url = new URL(args.url) } catch { return error('业务接口 URL 无效，请重新读取 get_api_info。') }
  if (String(args.http_method).toUpperCase() !== 'GET' || args.body !== undefined
    || url.origin !== 'https://gw.datayes.com' || url.username || url.password
    || !url.pathname.startsWith('/aladdin_proxy/data_api/api/')
    || !url.pathname.endsWith(`/${args.nameEn}.json`)
    || args.url_params !== undefined && !object(args.url_params)) {
    return error('调用与官网只读数据接口不匹配，请按 get_api_info 返回的 URL、GET 方法和参数调用。')
  }
  const parameters = { ...Object.fromEntries(url.searchParams), ...(args.url_params ?? {}) }
  return { endpoint: service.url, service, params: { name: service.dataTool,
    arguments: { api_name: args.nameEn, api_parameters: parameters } } }
}

export function officialDatayesResult(result, route) {
  if (!route?.definition || result?.isError) return result
  let info = result?.structuredContent
  if (!info) {
    try { info = JSON.parse((result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')) } catch {}
  }
  const path = info?.description?.match(/\/api\/[a-zA-Z0-9_/-]+\.json/)?.[0]
  if (info?.name !== route.definition || !path?.endsWith(`/${route.definition}.json`)
    || !Array.isArray(info?.parameters)) {
    return error('官网暂未返回可解析的接口定义，请使用其他已确认的接口。').result
  }
  const parametersInput = info.parameters.map(parameter => ({ ...parameter, location: 'Query' }))
  const definition = { nameEn: info.name, httpMethod: 'GET',
    httpUrl: 'https://gw.datayes.com/aladdin_proxy/data_api' + path,
    parametersInput, service: info.service, executionTransport: 'official-mcp' }
  const text = `接口: ${info.summary ?? info.name} (${info.name})\n来源: 官网 ${route.service.name}\n` +
    `调用: GET ${definition.httpUrl}\n说明: ${info.description}\n` +
    `【入参 ${parametersInput.length} 个】\n` + parametersInput.map(parameter =>
      `  ${parameter.name} | ${parameter.cname ?? parameter.name} | ${parameter.required ? '必填' : '可选'} | Query/${parameter.type} | ${parameter.description ?? ''}`).join('\n') +
    '\n【出参】\n' + (info.response?.schema ?? info.response?.description ?? '') +
    '\n该兼容调用由 EWork 网关经官网分类 MCP 执行，不会向旧套餐接口取数。'
  return { content: [{ type: 'text', text }], structuredContent: definition, isError: false }
}
