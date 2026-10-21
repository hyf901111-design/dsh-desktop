import { componentPluginSourceRequired, componentPluginSourceProhibited, componentSourceAllowsAlternatives } from './component-source-tools.js'

const webOnly = /(?:(?:只|仅)(?:能|可)?(?:使用|用)|走|使用|用)\s*(?:公开)?网页/u
const plugin = /通联|datayes|萝卜投研|\bMCP\b|插件/iu
const groups = [
  /估值|市盈率|市净率/u, /财务|财报|经营|利润/u, /新闻|资讯/u,
  /公告/u, /行情|报价|价格/u, /走势|趋势|历史|相对强弱/u,
  /未来|事件|日历/u, /研报|报告/u
]
const typeTopics = {news:'新闻资讯', reports:'研报报告', calendar:'未来事件日历'}
const unquoted = text => text.replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|"[^"\n]*"|‘[^’]*’|'[^'\n]*'|^\s*>[^\n]*/gmu, quote => /^(?:通联|datayes|萝卜投研|MCP|插件)$/iu.test(quote.slice(1,-1).trim()) ? quote.slice(1,-1).trim() : '')
const ambiguous = () => { throw Error('无法可靠确定本面板的人类来源约束，请明确来源适用的卡片及是否允许替代。') }

// This parser takes an authored request, never a prompt marker. Only the
// workbench host invokes it; model panel text supplies business preferences.
export function workbenchSourcePolicy(originalRequest, panel) {
  const text = unquoted(originalRequest)
  const identity = `${panel.title}\n${typeTopics[panel.type] ?? ''}\n${panel.prompt}`
  const relevant = []
  for (const sentence of text.split(/[。；;\n]/u)) {
    // Keep fallback language attached to the preceding source requirement.
    const clauses = sentence.split(/[，,](?!\s*(?:不可用时|失败时|否则|或|允许.{0,8}替代))/u)
    for (const clause of clauses.flatMap(part => part.split('、'))) {
      if (!plugin.test(clause) && !webOnly.test(clause)) continue
      if (!plugin.test(clause) && /(?:不要|禁止|不得|无需|不用|不使用).{0,6}网页/u.test(clause)) ambiguous()
      const required = componentPluginSourceRequired(clause), prohibited = componentPluginSourceProhibited(clause) || !componentSourceAllowsAlternatives(clause) && !plugin.test(clause) && webOnly.test(clause)
      if (!required && !prohibited) {
        if (!componentSourceAllowsAlternatives(clause) && /必须|只能|仅限|强制|唯一|禁止|禁用|不得/u.test(clause)) ambiguous()
        continue
      }
      if (/部分|某些|如果|若|视情况|适用时/u.test(clause)) ambiguous()
      const selector = clause.match(/([^，,。；;\n]*?)(?:面板|卡)/u)?.[1]
      if (selector !== undefined && !/(?:所有|全部|每个|各|整个工作台)$/u.test(selector.trim())) {
        const targets = groups.filter(group => group.test(selector))
        if (!targets.length) ambiguous()
        if (!targets.some(group => group.test(identity))) continue
      } else if (selector === undefined) {
        // Also accept natural shorthand such as “估值用DataYes、新闻走网页”.
        const prefix = clause.split(/只?使用|通过|调用|接入|只?用|走|禁止|不要|不得/u)[0]
        const targets = groups.filter(group => group.test(prefix))
        if (targets.length && !/创建|工作台|所有|全部/u.test(prefix) && !targets.some(group => group.test(identity))) continue
      }
      relevant.push(clause)
    }
  }
  const humanSource = relevant.join('；')
  const pluginRequired = componentPluginSourceRequired(humanSource)
  const pluginProhibited = componentPluginSourceProhibited(humanSource) || relevant.some(clause => !componentSourceAllowsAlternatives(clause) && !plugin.test(clause) && webOnly.test(clause))
  if (pluginRequired && pluginProhibited) ambiguous()
  // Remove model source names from routing preferences, not from the task:
  // entities, fields, dates, units and template contracts remain untouched.
  const preferenceRequest = `${panel.title}\n${panel.prompt}`.replace(/通联|datayes|萝卜投研|\bMCP\b|插件/giu, '') + (humanSource ? `\n${humanSource}` : '')
  return Object.freeze({pluginRequired, pluginProhibited, preferenceRequest})
}

// Internal host/storage shape only. The public start validator never accepts
// this key. Re-freeze after storage restore and detach caller-owned objects.
export function restoreWorkbenchHostContext(value) {
  if (value === undefined) return undefined
  const policy = value?.sourcePolicy
  if (!policy || typeof policy.pluginRequired !== 'boolean' || typeof policy.pluginProhibited !== 'boolean' ||
      policy.pluginRequired && policy.pluginProhibited || typeof policy.preferenceRequest !== 'string' || policy.preferenceRequest.length > 16000 ||
      typeof value.sourceRequirement !== 'string' || !value.sourceRequirement || value.sourceRequirement.length > 5000) ambiguous()
  let workbenchRequest
  if (value.workbenchRequest !== undefined) {
    const request = value.workbenchRequest
    if (!request || typeof request.originalRequest !== 'string' || !request.originalRequest.trim() || request.originalRequest.length > 8000 ||
        request.dataMode !== undefined && !['source','simulated'].includes(request.dataMode)) ambiguous()
    workbenchRequest = Object.freeze({originalRequest:request.originalRequest,dataMode:request.dataMode ?? 'source'})
  }
  return Object.freeze({...(workbenchRequest ? {workbenchRequest} : {}),sourcePolicy:Object.freeze({pluginRequired:policy.pluginRequired,pluginProhibited:policy.pluginProhibited,preferenceRequest:policy.preferenceRequest}),sourceRequirement:value.sourceRequirement})
}
