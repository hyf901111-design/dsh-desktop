import {defineTool} from '@deepseek-ai/dsh-tools'
import {isDeepStrictEqual} from 'node:util'
import {observedPrototypeSources,prototypeHtmlEvidence,resolvePrototypeHtmlSnapshot} from './prototype-html-snapshot.js'

const NAME='submit_prototype_view'
const column={type:'object',properties:{field:{type:'string'},label:{type:'string'},unit:{type:'string'},digits:{type:'integer'},scale:{type:'number'}},required:['field','label'],additionalProperties:false}
const array=items=>({type:'array',items})
// Edits address the frozen generated draft, never a filesystem path. Match all
// anchors before applying anything so ambiguous, overlapping or chained edits
// cannot silently discard an existing part of the requested interface.
function editDraft(html,edits){
 if(typeof html!=='string')throw Error('No owned HTML draft is available; submit view or html instead.')
 if(!Array.isArray(edits)||!edits.length||edits.length>32)throw Error('htmlEdits must contain 1–32 exact replacements, or submit the complete html.')
 const ranges=edits.map((edit,index)=>{
  if(!edit||Object.keys(edit).some(key=>!['find','replace'].includes(key))||typeof edit.find!=='string'||!edit.find||typeof edit.replace!=='string')throw Error('htmlEdits['+index+'] requires a nonempty find string and a replace string.')
  const start=html.indexOf(edit.find)
  if(start<0||html.indexOf(edit.find,start+1)>=0)throw Error('htmlEdits['+index+'].find must match exactly once in the original draft; use a longer surrounding anchor.')
  return{start,end:start+edit.find.length,replace:edit.replace}
 }).sort((a,b)=>a.start-b.start)
 for(let i=1;i<ranges.length;i++)if(ranges[i].start<ranges[i-1].end)throw Error('htmlEdits overlap; combine them into one replacement.')
 for(const edit of ranges.reverse())html=html.slice(0,edit.start)+edit.replace+html.slice(edit.end)
 return html
}
// The native typed-tool author API marks requiredness on each property.
const toolValue=({required,...value})=>({...value,...value.properties?{properties:Object.fromEntries(Object.entries(value.properties).map(([key,node])=>[key,{...toolValue(node),...required?.includes(key)?{required:true}:{}}]))}:{},...value.items?{items:toolValue(value.items)}:{},...value.oneOf?{oneOf:value.oneOf.map(toolValue)}:{}})

// Fixed recovery sources are retained by the producer. Initial submissions
// resolve names against this exact child's complete observations at execution;
// neither path allows the model to choose file paths or reconstruct source data.
export function createPrototypeSubmission({records,observeRecords,observedSources=false,panelRequest,targets,signal,candidate,validateSnapshot,preserveSourceAliases=false}){
 const observing=typeof observeRecords==='function'
 const evidence=!observing&&prototypeHtmlEvidence(records??[],panelRequest,targets,{candidate,observedSources})
 if(!observing&&!evidence||observing&&!targets?.files?.length)return undefined
 const sources=observing?[]:JSON.parse(evidence)
 const preserves=preserveSourceAliases&&Array.isArray(candidate?.requests)&&candidate.requests.length===sources.length&&candidate.requests.every(request=>sources.some(source=>source.tool===request.tool&&isDeepStrictEqual(source.args,request.args)))
 if(preserveSourceAliases&&!preserves)return undefined
 const requests=preserves?structuredClone(candidate.requests):sources.map((source,i)=>({key:sources.length===1?'products':'source'+(i+1),tool:source.tool,args:structuredClone(source.args)}))
 const frozenRecords=requests.map(request=>structuredClone(records.findLast(record=>record.tool===request.tool&&isDeepStrictEqual(record.args,request.args))))
 let child,disposed=false,pending,accepted,finish,lastRejected
 const releases=[]
 const result=new Promise(resolve=>{finish=resolve})
 const sourceNames=requests.map(request=>request.key)
 const draft=candidate?.mapping?.view===undefined&&typeof candidate?.mapping?.html==='string'&&isDeepStrictEqual(candidate.requests,requests)?structuredClone(candidate.mapping):undefined
 const aggregateColumn={type:'object',properties:{...column.properties,operation:{type:'string',enum:['count','sum','any']},trueLabel:{type:'string'},falseLabel:{type:'string'}},required:['label','operation'],additionalProperties:false}
 const groupBy={type:'object',properties:{field:{type:'string'},label:{type:'string'},omitEmpty:{type:'boolean'},columns:array(aggregateColumn)},required:['field','label','columns'],additionalProperties:false}
 const singleView={type:'object',properties:{source:{type:'string',...observing?{description:'A key from this call\'s sources; never a file path.'}:{enum:sourceNames}},path:{type:'string'},kind:{type:'string',enum:['table','bars','stacked-bars']},palette:{type:'object',description:'Optional original legend colors: source/path must resolve to observed [series label, #RRGGBB] pairs.',properties:{source:{type:'string'},path:{type:'string'}},required:['source','path'],additionalProperties:false},series:array({type:'object',properties:{...column.properties,subtract:{type:'string'}},required:['field','label'],additionalProperties:false}),key:{type:'string'},value:{type:'string'},label:{type:'string'},unit:{type:'string'},digits:{type:'integer'},scale:{type:'number'},columns:array(column),search:array({type:'string'}),filters:array({type:'object',properties:{field:{type:'string'},label:{type:'string'},kind:{type:'string',enum:['category','sign']}},required:['field','label','kind'],additionalProperties:false}),periods:array({type:'object',properties:{field:{type:'string'},label:{type:'string'}},required:['field','label'],additionalProperties:false}),details:{type:'object',properties:{field:{type:'string'},label:{type:'string'},columns:array(column),fields:array(column)},additionalProperties:false},highlight:array({type:'string'}),groupBy},required:['source','path','kind'],additionalProperties:false}
 const view={oneOf:[singleView,...['tabs','sections'].map(key=>({type:'object',properties:{kind:{type:'string',enum:[key]},[key]:array({type:'object',properties:{label:{type:'string'},view:singleView},required:['label','view'],additionalProperties:false})},required:['kind',key],additionalProperties:false}))]}
 const definition=defineTool({
  name:NAME,description:(draft?'Repair the existing HTML with title and required htmlEdits (exact unique find/replace anchors from the original draft), retaining its layout and interactions. For a full structural replacement, submit html and htmlEdits:[]. ':'Submit title and view, or custom html if the requested interactions need it. After a rejected html submission, use htmlEdits for exact unique find/replace repairs against the latest rejected page instead of resending it. ')+'This commits the finished component and ends its generation when accepted; do not use it to probe with placeholders or partial features. The host owns authorized source requests, injects all observed records and validates the complete result before accepting. Does not edit files or create additional tasks.',
  parameters:{title:{type:'string',required:true},...observing?{sources:{...toolValue(array({type:'object',properties:{key:{type:'string'},section:{type:'string',description:'Exact section already read completely by this child with read_prototype.'}},required:['key','section'],additionalProperties:false})),required:true}}:{},...draft?{htmlEdits:{...toolValue(array({type:'object',properties:{find:{type:'string'},replace:{type:'string'}},required:['find','replace'],additionalProperties:false})),required:true}}:{htmlEdits:{...toolValue(array({type:'object',properties:{find:{type:'string'},replace:{type:'string'}},required:['find','replace'],additionalProperties:false})),description:'Optional exact unique edits against this child latest rejected HTML; keep source aliases. Omit html and view when using edits.'},view:toolValue(view),note:{type:'string',description:'Visible business rules and source notes only; internal repair details belong in repairSummary.'}},repairSummary:{type:'string',description:'Optional internal repair summary, never shown in the component. Preserve business and source notes in note or the HTML.'},html:{type:'string'}},
  output:{schema:{type:'object',properties:{accepted:{type:'boolean',required:true}},additionalProperties:false},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
  isConcurrencySafe:()=>false,
  async execute(args,exec){
   signal?.throwIfAborted();exec.signal?.throwIfAborted()
   if(disposed||exec.agent!==child||accepted)throw Error('This component submission is closed or belongs to another execution.')
   if(!args||Object.keys(args).some(key=>!['title','html','htmlEdits','repairSummary',...observing?['sources']:[],...draft?[]:['view','note']].includes(key)))throw Error(draft?'Repair the original HTML with title and htmlEdits, or submit complete html; optional repairSummary is internal, not a component note. Retain requested interactions and business notes.':'Submit only title and view (or html), with an optional business note and internal repairSummary'+(observing?' and the sources already read by this child.':'.'))
   if(draft){
    if(!Array.isArray(args.htmlEdits))throw Error('htmlEdits is required for this draft: submit exact find/replace edits, or complete html with htmlEdits:[].')
    if(args.html!==undefined&&args.htmlEdits.length)throw Error('Use exact htmlEdits or complete html with htmlEdits:[], not both.')
   }else if(args.htmlEdits!==undefined){
    if(!Array.isArray(args.htmlEdits)||args.view!==undefined||args.html!==undefined&&args.htmlEdits.length)throw Error('Use htmlEdits to repair the latest rejected HTML, or submit complete html with htmlEdits:[]; do not combine edits with view.')
    if(args.html===undefined&&!lastRejected)throw Error('No rejected HTML from this child is available; first submit complete view or html.')
   }else if([args.view,args.html].filter(value=>value!==undefined).length!==1)throw Error('Choose exactly one of view or html.')
   let sourceIssue
   const current=observing?observedPrototypeSources(observeRecords(),args.sources,targets,{onIssue:value=>{sourceIssue=value}}):{requests,records:frozenRecords}
   if(!current)throw Error(sourceIssue??'sources must name 1–8 distinct complete read_prototype sections already observed by this child from the authorized user file. Continue reading partial sections; indexes, functions, unobserved sections and ambiguous files cannot be submitted.')
   // Freeze each successful source response before validation/receipt. Later
   // reads or a caller mutating its records cannot change an accepted artifact.
   const{htmlEdits,repairSummary,sources:sourceSelection,...mapping}=args
   const base=draft??(htmlEdits!==undefined&&mapping.html===undefined?lastRejected?.mapping:undefined)
   if(base){
    if(!draft&&!isDeepStrictEqual(current.requests,lastRejected.requests))throw Error('htmlEdits must retain the latest rejected page source aliases and exact observed requests; submit full html when changing sources.')
    if(mapping.html===undefined)mapping.html=editDraft(base.html,htmlEdits)
    if(mapping.note===undefined&&typeof base.note==='string')mapping.note=base.note
    if(base.notes!==undefined)mapping.notes=structuredClone(base.notes)
   }
   const candidate={version:1,type:'data-bound',requests:structuredClone(current.requests),mapping:{version:1,type:'html',...mapping}}
   let issue
   try{
    const snapshot=resolvePrototypeHtmlSnapshot(candidate,current.records,{panelRequest,onPrototypeScaleIssue:value=>{issue=value},onPrototypeViewIssue:value=>{issue=value}})
    if(!snapshot)throw Error(issue??'The component configuration is invalid. Keep real source fields, supported controls, and exactly one of view or html; custom html needs an empty source slot for each host source key.')
    // Validation still owns acceptance; keeping an inert rejected draft only
    // avoids forcing a full HTML rewrite for each correctable declaration.
    validateSnapshot?.(snapshot)
   }catch(error){
    if(!draft&&typeof candidate.mapping.html==='string'&&Buffer.byteLength(candidate.mapping.html)<=200000){
     lastRejected=structuredClone(candidate)
     throw Error((error instanceof Error?error.message:String(error))+' Latest rejected HTML retained by this child; keep sources and submit htmlEdits:[{find:"exact unique original fragment",replace:"correction"}] to fix only this issue, or submit a complete replacement.')
    }
    throw error
   }
   signal?.throwIfAborted();exec.signal?.throwIfAborted()
   pending={callId:exec.callId,text:JSON.stringify(candidate)}
   return{accepted:true}
  }
 })
 const dispose=()=>{if(disposed)return;disposed=true;for(const release of releases.splice(0).reverse())release();signal?.removeEventListener('abort',dispose);pending=accepted=lastRejected=undefined}
 signal?.addEventListener('abort',dispose,{once:true})
 return{
  instruction:observing?'来源选择为sources:[{key:"products",section:"本卡已读齐的实际数据段"}]。view.source使用key，path相对完整响应；宿主只注入本任务实际读齐的完整数据，不接受索引、函数或两行样本。业务规则和来源可写note，内部校验修复说明仅写repairSummary，不展示给用户。':(draft?'现有候选的完整 HTML 已随错误提供。局部修复优先提交 title 与必填 htmlEdits:[{find:"原页面中唯一的完整片段",replace:"修正片段"}]，各 find 均匹配原候选，不链式匹配；保留其他内容和全部交互。外层不支持的元字段由宿主移除，不用重写页面。需要重排时仍可提交完整 html 并传 htmlEdits:[]。':'多个数据视图需放在同一卡时可用view:{kind:"tabs",tabs:[{label:"页签名",view:单个table或bars配置},...]}，各视图使用自己的source/path；统计窗口用periods。view.path相对完整响应。')+'当前是组件提交阶段，仅调用submit_prototype_view，不再输出外层JSON、requests或生成计划。宿主固定来源别名与原始读取参数：'+JSON.stringify(requests)+'. 全部记录由宿主注入。自定义html使用各别名对应的空script application/json槽（id=sherlock-source-别名）。保留原需求的全部交互、来源含义和单位。',
  result,
  // Host-only continuation snapshot. No draft from another child/caller can be
  // turned into edit authority; the adapter retains this before unregistering.
  rejectedCandidate:()=>lastRejected?structuredClone(lastRejected):undefined,
  register(agent){
   signal?.throwIfAborted()
   if(disposed||child||!agent.ctx.tools?.register||!agent.ctx.tools?.guard)throw Error('组件提交边界不可用。')
   child=agent
   try{
    releases.push(agent.ctx.tools.guard(exec=>exec.name===NAME&&exec.agent!==agent?'This submission belongs only to its component child.':undefined))
    releases.push(agent.ctx.tools.register(definition))
   }catch(error){dispose();throw error}
  },
  accept(event){
   if(disposed||signal?.aborted||!pending&&!accepted)return
   if(event?.type==='tool/result'&&pending){
    const message=event.data?.message,blocks=message?.content??[]
    const matching=blocks.filter(block=>block.toolCallId===pending.callId)
    if(message?.source?.callId===pending.callId||matching.length){
     if(!event.data?.error&&!matching.some(block=>block.isError===true||block.error!=null))accepted=pending
     pending=undefined
    }
   }
   if(event?.type==='step/end'&&accepted){
    const output=accepted.text
    finish({stopReason:'completed',output:[{type:'text',text:output}]})
   }
  },
  dispose
 }
}
