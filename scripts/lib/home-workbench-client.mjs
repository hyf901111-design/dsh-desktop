import {patchHomeWorkbenchProgress,stripHomeWorkbenchProgress} from './home-workbench-progress.mjs'
import {HOME_WORKBENCH_STUDY_DATA} from '../../packages/dsh-research-task-runtime/home-workbench-study-contract.js'
import {homeWorkbenchStudyDefinitions,homeWorkbenchStudyCss} from './home-workbench-study.mjs'

/** Read-only recorded evidence; never delegate a missing value to live services. */
export function homeWorkbenchSnapshotProvider(){
 const data=HOME_WORKBENCH_STUDY_DATA,symbols=data.companies.map(c=>({market:c.exchange,code:c.id,name:c.name})),at=data.snapshot+'T15:00:00+08:00'
 const find=s=>data.companies.find(c=>c.id===s?.code&&c.exchange===s?.market)
 return {snapshotDate:data.snapshot,symbols,async request(input){
  const selected=(input.symbols||[]).map(find),base={source:'腾讯证券',receivedAt:at,snapshotDate:data.snapshot,volumeUnit:'手',basis:'不复权',stale:false}
  if(input.action==='search')return {symbols:symbols.filter(s=>(s.name+s.code+s.market).toLowerCase().includes(String(input.query||'').trim().toLowerCase()))}
  if(input.action==='quotes')return {...base,quotes:selected.filter(Boolean).map(c=>{const bar=c.prices.at(-1);return {market:c.exchange,code:c.id,name:c.name,price:c.close,priceChange:c.change,changePercent:c.changePct,open:bar.open,high:bar.high,low:bar.low,previousClose:c.close-c.change,volume:bar.volume,time:data.snapshot+' 15:00:00',quoteTime:at,quotedAt:at,timeZone:'Asia/Shanghai',currency:'CNY',source:'腾讯证券'}}),errors:selected.flatMap((c,i)=>c?[]:[{code:input.symbols[i]?.code||'',error:'此历史用例未收录该标的'}])}
  if(input.action==='history'){
   if(!selected[0])throw Error('此历史用例未收录该标的')
   if(input.period==='1m')throw Error('历史用例仅包含日K及以上周期，没有分时快照')
   if(input.adjustment&&input.adjustment!=='none')throw Error('此历史快照仅收录不复权数据')
   return {...base,bars:selected[0].prices.map(b=>({...b})),nativePeriod:false}
  }
  throw Error('此历史用例未提供这类数据')
 }}
}

const START='/* odyssey:home-workbench-client:start:v1 */',END='/* odyssey:home-workbench-client:end:v1 */'
const patches=[
 ['footer',"if(['iframe','youtube','calendar-tool'].includes(node.containerSpec?.type))return null;","if(node.containerSpec?.type==='research-study')return null;\n"],
 ['parser','if (value.type === "web") {','if(value.type==="research-study")return parseHomeWorkbenchStudySpec(value);\n'],
 ['body','function ResearchContainerBody({ node, sessionId, visible, officePreview, onHtmlSize, preserveHeading = false }) {','\nif(node.containerSpec?.type===\'research-study\')return react.createElement(HomeWorkbenchStudy,{node,sessionId,readOnly:sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true});\n','after'],
 ['sink','const htmlFitStates = new Map();',`homeWorkbenchStudySinks.set(sessionId,(nodeId,expected,next)=>{
  if(!collaborationCanWrite())return false;
  const node=snapshot.artifacts.find(n=>n.id===nodeId),spec=parseHomeWorkbenchStudySpec(next);
  if(node?.containerSpec?.type!=='research-study'||JSON.stringify(node.containerSpec)!==JSON.stringify(expected)||!spec||spec.studyRole!==expected.studyRole)return false;
  return commitUpdate({artifacts:synchronizeHomeWorkbenchStudies(snapshot.artifacts.map(n=>n.id===nodeId?{...n,containerSpec:spec}:n),nodeId)},true)!==false;
 });\n`],
 ['sync','const commitUpdate = (patch, persist = true) => {','\nif(patch.artifacts)patch={...patch,artifacts:synchronizeHomeWorkbenchStudies(patch.artifacts)};\n','after'],
 ['interactive','const isInteractiveTarget = (target) => typeof target?.closest === "function" && (','target.closest("[data-home-workbench-study]") !== null || ','after'],
 ['dimensions','function researchOptimalDimensions(node = {}, measured = null) {',"\nif(node.containerSpec?.type==='research-study')return {width:node.width||480,height:node.height||380};\n",'after']
]
const marked=(id,text)=>'/* hwb:'+id+':start */'+text+'/* hwb:'+id+':end */'
export function stripHomeWorkbenchClient(source){
 if(source.includes(START)){
  if(source.split(START).length!==2||source.split(END).length!==2)throw Error('Workbench client boundary drifted')
  const a=source.indexOf(START),b=source.indexOf(END,a)+END.length;source=source.slice(0,a)+source.slice(b+(source[b]==='\n'?1:0))
 }
 for(const[id]of patches)source=source.replace(new RegExp('/\\* hwb:'+id+':start \\*/[\\s\\S]*?/\\* hwb:'+id+':end \\*/','g'),'')
 source=source.replace('new Set(["research-study",','new Set([')
 return stripHomeWorkbenchProgress(source)
}
export function patchHomeWorkbenchClient(source){
 source=patchHomeWorkbenchProgress(stripHomeWorkbenchClient(source))
 const anchor='function createResearchWorkspaceSession(storage, sessionId) {'
 const one=(a,b)=>{const re=new RegExp('^[ \t]*'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gm'),hits=[...source.matchAll(re)];if(hits.length!==1)throw Error('Workbench client anchor drifted: '+a.slice(0,80)+' ('+hits.length+')');const at=hits[0].index+hits[0][0].length-a.length;source=source.slice(0,at)+b+source.slice(at+a.length)}
 const style=`if(typeof document!=="undefined"){let style=document.getElementById("ework-home-workbench-style");if(!style){style=document.createElement("style");style.id="ework-home-workbench-style";document.head.append(style)}style.textContent=${JSON.stringify(homeWorkbenchStudyCss())};}`
 one(anchor,START+'\nconst homeWorkbenchStudySinks=new Map();\n'+homeWorkbenchStudyDefinitions()+'\n'+homeWorkbenchSnapshotProvider.toString()+'\n'+style+'\n'+END+'\n'+anchor)
 const types=/const RESEARCH_CONTAINER_TYPES = (?:\/\* @__PURE__ \*\/ )?new Set\(\[[^\]]+\]/
 if(!source.match(types))throw Error('Workbench container schema missing')
 source=source.replace(types,s=>s.replace('new Set([','new Set(["research-study",'))
 for(const[id,at,text,where]of patches)one(at,where==='after'?at+marked(id,text):marked(id,text)+at)
 return source
}
