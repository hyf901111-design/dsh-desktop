import {restoreExplicitScope} from './workbench-explicit-scope.js'
import { componentPluginSourceRequired, componentPluginSourceProhibited, componentSourceAllowsAlternatives } from './component-source-tools.js'
import {validatePublicDataPanel} from './workbench-public-data.js'
import {isDeepStrictEqual} from 'node:util'

const webOnly = /(?:(?:只|仅)(?:能|可)?(?:使用|用)|走|使用|用)\s*(?:公开)?网页/u
const plugin = /tushare|通联|datayes|萝卜投研|\bMCP\b|插件/iu
// These providers have distinct identities beyond this policy's plugin flags.
// Do not turn a human's exclusive provider into a generic plugin prohibition.
const exclusivePublicSource = /(?:仅|只)(?:能|可)?(?:使用|用|调用|通过|接入|从)[^。；;，,\n]{0,24}(?:腾讯|新浪|tencent|sina|public_data_query)|(?:来源|数据源)\s*(?:仅限|限定为)[^。；;，,\n]{0,24}(?:腾讯|新浪|tencent|sina|public_data_query)/iu
const groups = [
  /估值|市盈率|市净率/u, /财务|财报|经营|利润/u, /新闻|资讯/u,
  /公告/u, /行情|报价|价格/u, /走势|趋势|历史|相对强弱/u,
  /未来|事件|日历/u, /研报|报告/u
]
const typeTopics = {news:'新闻资讯', reports:'研报报告', calendar:'未来事件日历'}
const unquoted = text => text.replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|"[^"\n]*"|‘[^’]*’|'[^'\n]*'|^\s*>[^\n]*/gmu, quote => /^(?:tushare|通联|datayes|萝卜投研|MCP|插件|腾讯|新浪|tencent|sina|public_data_query)$/iu.test(quote.slice(1,-1).trim()) ? quote.slice(1,-1).trim() : '')
const ambiguous = () => { throw Error('无法可靠确定本面板的人类来源约束，请明确来源适用的卡片及是否允许替代。') }
const publicSourceDenied='本组件仅允许已校验的腾讯报价请求；其他来源或参数不能替代。'
function strictPublicRequests(value){
  if(!Array.isArray(value)||value.length!==1||value.some(request=>!request||Object.keys(request).some(key=>!['operation','source','parameters_json'].includes(key))||request.operation!=='query'))ambiguous()
  const recipe=validatePublicDataPanel({profile:'quotes-table',intervalMinutes:0,requests:value.map(({operation,...request})=>request)},'market',{strictParameters:true})
  return Object.freeze(recipe.requests.map(request=>Object.freeze({operation:'query',...request})))
}
function samePublicRequest(actual,expected){
  try{return isDeepStrictEqual({...actual,parameters_json:JSON.parse(actual.parameters_json)},{...expected,parameters_json:JSON.parse(expected.parameters_json)})}catch{return false}
}
// This is a monotonic SDK guard, not prompt advice or a new network grant.
export function workbenchPublicSourceCallIssue(policy,name,args){
  if(!policy?.publicSourceRequests)return
  if(name!=='public_data_query'||!args||typeof args!=='object'||Array.isArray(args))return publicSourceDenied
  if(args.operation==='catalog')return Object.keys(args).every(key=>['operation','source','category','parameters_json'].includes(key))&&(args.source===undefined||args.source==='tencent-quotes')&&(args.category===undefined||args.category==='market')&&(args.parameters_json===undefined||policy.publicSourceRequests.some(request=>samePublicRequest({operation:'query',source:'tencent-quotes',parameters_json:args.parameters_json},request)))?undefined:publicSourceDenied
  return policy.publicSourceRequests.some(request=>samePublicRequest(args,request))?undefined:publicSourceDenied
}
export function workbenchPublicSourceEvidenceIssue(policy,records){
  if(!policy?.publicSourceRequests)return
  const business=records.filter(record=>record.purpose!=='discovery')
  if(business.some(record=>workbenchPublicSourceCallIssue(policy,record.tool,record.args)))return publicSourceDenied
  if(!business.some(record=>record.tool==='public_data_query'&&record.args?.operation==='query'&&!workbenchPublicSourceCallIssue(policy,record.tool,record.args)&&record.response?.sourceId==='tencent-quotes'&&Array.isArray(record.response.records)))return '本组件必须实际取得已校验的腾讯报价响应；接口目录或其他来源不能作为取数结果。'
}

// This parser takes an authored request, never a prompt marker. Only the
// workbench host invokes it; model panel text supplies business preferences.
export function workbenchSourcePolicy(originalRequest, panel, options={}) {
  const text = unquoted(originalRequest)
  const identity = `${panel.title}\n${typeTopics[panel.type] ?? ''}\n${panel.prompt}`
  const relevant = []
  let publicSourceRequests
  for (const sentence of text.split(/[。；;\n]/u)) {
    // Keep fallback language attached to the preceding source requirement.
    const clauses = sentence.split(/[，,](?!\s*(?:不可用时|失败时|否则|或|允许.{0,8}替代))/u)
    for (const clause of clauses.flatMap(part => part.split('、'))) {
      const forbiddenTencent=/(?:不要|禁止|不得|不用|不使用|不再使用|不再用)(?:再)?(?:使用|用|调用|通过|接入)?\s*(?:腾讯(?:行情|报价)?|tencent(?:-quotes)?)(?:\s*(?:取数|(?:作为)?(?:数据)?来源|接口))?\s*$/iu.test(clause)
      const unsupportedProvider = exclusivePublicSource.test(clause)||forbiddenTencent
      if (!unsupportedProvider && !plugin.test(clause) && !webOnly.test(clause)) continue
      if (!plugin.test(clause) && /(?:不要|禁止|不得|无需|不用|不使用).{0,6}网页/u.test(clause)) ambiguous()
      const required = componentPluginSourceRequired(clause), prohibited = componentPluginSourceProhibited(clause) || !componentSourceAllowsAlternatives(clause) && !plugin.test(clause) && webOnly.test(clause)
      if (!unsupportedProvider && !required && !prohibited) {
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
      if (unsupportedProvider){
        if(forbiddenTencent||!/(?:腾讯|tencent)/iu.test(clause)||/新浪|sina|kraken|网页|其他来源/iu.test(clause)||plugin.test(clause)||componentSourceAllowsAlternatives(clause)||!options.publicSourceRequests)throw Error('当前工作台暂不支持准确执行此排他来源约束（腾讯、新浪或 public_data_query）；未启动面板任务，不能改用其他来源。')
        publicSourceRequests=strictPublicRequests(options.publicSourceRequests)
      }
      relevant.push(clause)
    }
  }
  const humanSource = relevant.join('；')
  const pluginRequired = componentPluginSourceRequired(humanSource)
  const mandatoryWeb=relevant.some(clause => !componentSourceAllowsAlternatives(clause) && !plugin.test(clause) && webOnly.test(clause))
  const pluginProhibited = !!publicSourceRequests||componentPluginSourceProhibited(humanSource) || mandatoryWeb
  if(publicSourceRequests&&mandatoryWeb)ambiguous()
  if (pluginRequired && pluginProhibited) ambiguous()
  // Remove model source names from routing preferences, not from the task:
  // entities, fields, dates, units and template contracts remain untouched.
  const preferenceRequest = `${panel.title}\n${panel.prompt}`.replace(/tushare|通联|datayes|萝卜投研|\bMCP\b|插件/giu, '') + (humanSource ? `\n${humanSource}` : '')
  return Object.freeze({pluginRequired, pluginProhibited, preferenceRequest,...publicSourceRequests?{publicSourceRequests}:{}})
}

// Internal host/storage shape only. The public start validator never accepts
// this key. Re-freeze after storage restore and detach caller-owned objects.
export function restoreWorkbenchHostContext(value) {
  if (value === undefined) return undefined
  if (value?.sourceMessageId !== undefined && (typeof value.sourceMessageId !== 'string' || !value.sourceMessageId.trim() || value.sourceMessageId.length > 256)) ambiguous()
  const policy = value?.sourcePolicy
  if (!policy || typeof policy.pluginRequired !== 'boolean' || typeof policy.pluginProhibited !== 'boolean' ||
      policy.pluginRequired && policy.pluginProhibited || typeof policy.preferenceRequest !== 'string' || policy.preferenceRequest.length > 16000 ||
      typeof value.sourceRequirement !== 'string' || !value.sourceRequirement || value.sourceRequirement.length > 5000) ambiguous()
  if(policy.publicSourceRequests!==undefined&&(policy.pluginRequired||!policy.pluginProhibited))ambiguous()
  if(value.explicitScope!==undefined&&value.workbenchRequest===undefined)ambiguous()
  let workbenchRequest
  if (value.workbenchRequest !== undefined) {
    const request = value.workbenchRequest
    if (!request || typeof request.originalRequest !== 'string' || !request.originalRequest.trim() || request.originalRequest.length > 8000 ||
        request.dataMode !== undefined && !['source','simulated'].includes(request.dataMode)) ambiguous()
    workbenchRequest = Object.freeze({originalRequest:request.originalRequest,dataMode:request.dataMode ?? 'source'})
  }
  return Object.freeze({...(value.sourceMessageId === undefined ? {} : {sourceMessageId:value.sourceMessageId}),...(value.explicitScope === undefined ? {} : {explicitScope:restoreExplicitScope(value.explicitScope)}),...(workbenchRequest ? {workbenchRequest} : {}),sourcePolicy:Object.freeze({pluginRequired:policy.pluginRequired,pluginProhibited:policy.pluginProhibited,preferenceRequest:policy.preferenceRequest,...policy.publicSourceRequests===undefined?{}:{publicSourceRequests:strictPublicRequests(policy.publicSourceRequests)}}),sourceRequirement:value.sourceRequirement})
}
