import {acceptArtifactOutput} from './artifact-output.js'
import {parseResearchContainerSpec} from './artifact-validator.js'
import {readTemplateModel,templateFor} from './component-template-registry.js'
import {financialWidgetSpec,financialWidgetDimensions,financialNewsQuery} from './financial-widget-contract.js'
import {researchHtmlText} from './html-artifact.js'

const MAX_INPUT_BYTES=1024*1024
const allowedTypes=new Set(['financial-widget','chart','table','kpi','markdown','html','mind-map','summary'])
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
function jsonCopy(value,depth=0,ancestors=new Set()){
 if(depth>32)throw Error('对话组件参数嵌套过深。')
 if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return value
 if(!Array.isArray(value)&&!plain(value)||ancestors.has(value))throw Error('对话组件参数必须为有限的 JSON 数据。')
 ancestors.add(value)
 const result=Array.isArray(value)?value.map(item=>jsonCopy(item,depth+1,ancestors)):Object.fromEntries(Object.keys(value).sort().map(key=>[key,jsonCopy(value[key],depth+1,ancestors)]))
 ancestors.delete(value);return result
}
export function canonicalConversationComponentInput(args){
 const text=JSON.stringify(jsonCopy(args))
 if(new TextEncoder().encode(text).byteLength>MAX_INPUT_BYTES)throw Error('单个对话组件输入不能超过 1 MiB。')
 return text
}
function detachedSpec(value){
 const spec=parseResearchContainerSpec(value)
 if(!spec)throw Error('对话组件内容不符合现有组件格式。')
 if(spec.type==='financial-widget'){
  const {linkedWatchlistId,linkedSourceId,...config}=spec
  if(spec.widget==='news'&&spec.linkedSourceId){
   config.query=financialNewsQuery(spec)
   if(!config.query.trim())throw Error('联动新闻缺少可恢复的独立标的查询，不能复制为全市场新闻。')
  }
  const parsed=financialWidgetSpec(config);if(!parsed)throw Error('金融组件配置无效。');return parsed
 }
 if((spec.type==='summary'||spec.type==='mind-map')&&spec.source){
  return {...spec,source:{title:spec.source.title,text:spec.source.text}}
 }
 return spec
}
function artifactProvenance(spec,model){
 const names=[]
 const name=value=>{if(typeof value==='string'&&value.trim()&&!names.includes(value.trim()))names.push(value.trim())}
 if(typeof model.source==='string')name(model.source)
 else if(plain(model.source))name(model.source.title)
 if(Array.isArray(model.sources))for(const source of model.sources){if(typeof source==='string')name(source);else if(plain(source))name(source.label??source.name??source.title)}
 if(Array.isArray(model.items))for(const item of model.items)if(plain(item))name(item.publisher)
 const asOf=['asOf','dataDate','reportDate','quote_time'].map(key=>model[key]).find(value=>typeof value==='string'&&value.trim())
 return {sourceNames:names,sourceState:names.length?'provided':'unspecified',...(asOf?{dataAsOf:asOf}:{}),refreshKind:spec.type==='financial-widget'?'native':'snapshot'}
}
export function normalizeConversationComponentArtifact(args){
 const input=JSON.parse(canonicalConversationComponentInput(args))
 if(!plain(input)||Object.keys(input).some(key=>!['artifact','title'].includes(key))||!plain(input.artifact))throw Error('对话组件只接受完整 artifact 和可选 title，不能指定身份、prompt 或 recipe。')
 if(input.title!==undefined&&(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>120))throw Error('对话组件标题需为 1–120 个字符。')
 const artifact=input.artifact
 const forbidden=['owner','ownerAccountId','sessionId','turnId','mode','identity','authorityId','authoritySeq','windowGeneration','prompt','recipe','path','paths','authorization','headers','ipc','channel']
 if(Object.keys(artifact).some(key=>forbidden.includes(key)))throw Error('对话组件 artifact 包含未授权字段。')
 if(['files','gallery','calendar-tool','web','iframe','audio','youtube'].includes(artifact.type))throw Error('该类型尚未适配对话组件授权。')
 if(artifact.type==='financial-widget'&&(Object.hasOwn(artifact,'linkedWatchlistId')||Object.hasOwn(artifact,'linkedSourceId')))throw Error('对话组件没有画布连接节点，请提供独立 symbols/query。')
 const output=acceptArtifactOutput(JSON.stringify(artifact))
 if(!output)throw Error('对话组件 artifact 无效，请提交已完成的现有组件结构。')
 const parsed=parseResearchContainerSpec(JSON.parse(output))
 if(!parsed||!allowedTypes.has(parsed.type))throw Error('规范化后的类型不支持对话组件。')
 const containerSpec=detachedSpec(parsed)
 const title=(input.title??containerSpec.title).trim()
 if(!title||title.length>120)throw Error('对话组件标题需为 1–120 个字符。')
 const model=readTemplateModel(containerSpec)?.data??containerSpec
 const dimensions=containerSpec.type==='financial-widget'?financialWidgetDimensions(containerSpec):templateFor(model)
 const preferredSize=dimensions?{width:dimensions.width,height:dimensions.height}:{width:620,height:420}
 const readableText=containerSpec.type==='html'&&!readTemplateModel(containerSpec)?researchHtmlText(containerSpec.html):containerSpec.type==='markdown'||containerSpec.type==='mind-map'||containerSpec.type==='summary'?[containerSpec.content,containerSpec.source?.title,containerSpec.source?.text].filter(Boolean).join('\n\n'):JSON.stringify(model,null,2)
 return {containerSpec,title,preferredSize,readableText,provenance:artifactProvenance(containerSpec,model)}
}
// Self-contained: the renderer serializes these parsers into its bounded bundle.
export function parseConversationComponentManifest(value){
 const keys=['version','kind','componentId','sessionId','turnId','requestId','status']
 const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/u.test(value)
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))||value.version!==1||value.kind!=='conversation-component'||value.status!=='ready'||!['componentId','sessionId','turnId','requestId'].every(key=>id(value[key])))return null
 return {version:1,kind:'conversation-component',componentId:value.componentId,sessionId:value.sessionId,turnId:value.turnId,requestId:value.requestId,status:'ready'}
}
export function parseConversationComponentReference(value){
 const keys=['version','kind','sessionId','componentId','revision','title']
 const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/u.test(value)
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))||value.version!==1||value.kind!=='conversation-component'||!id(value.sessionId)||!id(value.componentId)||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.title!=='string'||!value.title.trim()||value.title.length>120)return null
 return {version:1,kind:'conversation-component',sessionId:value.sessionId,componentId:value.componentId,revision:value.revision,title:value.title}
}
export function detachConversationComponentNode(node){
 const value=jsonCopy(node)
 if(!plain(value)||!plain(value.containerSpec))throw Error('复制的对话组件无效。')
 const keys=['id','kind','x','y','width','height','aspectRatio','stackOrder','sizeMode','title','displayName','name','excerpt','sourceText','generationStatus','presentation']
 const output=Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]))
 return {...output,containerSpec:detachedSpec(value.containerSpec),refreshMinutes:0}
}
