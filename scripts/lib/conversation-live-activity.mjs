import {createHash} from 'node:crypto'
import {conversationPublicReplies,ConversationActivityDetails,statusPresentationCss,transformStatusPresentation} from './conversation-status-presentation.mjs'
const START='/* ework:conversation-live-activity:v2 */',LEGACY='/* ework:conversation-live-activity:v1 */',END='/* ework:conversation-live-activity:end */'

/** Read the current run only. Completed tools and private reasoning are never
 * republished as a new action, and a queued message does not start a new run. */
export function conversationLiveActivity({running,runningTurn,order=[],nodeStore,flow=[],noteRows=[],canvasTasks=[],openState='open',labelForNode,statusForNodes,t,english=false}) {
 const copy=(zh,en)=>english?en:zh
 if(openState==='loading'||openState==='error')return null
 const scoped=order.map(key=>nodeStore?.get(key)).filter(node=>{
  const turn=node?.location?.turn?.turn??node?.data?.turn
  return node&&Number.isFinite(runningTurn)&&turn===runningTurn
 })
 if(running){
  const active=scoped.filter(node=>node.kind==='tool-call'&&node.data?.root&&typeof node.data.root==='object'&&!('kind' in node.data.root))
  if(active.length){
   const node=active.at(-1),root=node.data.root,name=String(root.name??'').toLowerCase()
   if(/request_user_input|ask_user|ask_question/.test(name))return{kind:'waiting',label:copy('等待你的回答','Waiting for your answer')}
   if(/request.*permission|request.*approval/.test(name))return{kind:'waiting',label:copy('等待你的授权','Waiting for your approval')}
   const plans=scoped.filter(item=>item.kind==='tool-call'&&/todo|plan/.test(String(item.data?.root?.call?.name??item.data?.root?.name??'')))
   const label=(statusForNodes?.([...plans,node],t)??labelForNode?.(node,t))||copy('正在执行任务…','Working…')
   return{kind:'tool',label,parallelCount:active.length}
  }
  const node=scoped.at(-1)
  if(node?.kind==='compaction'&&node.data?.running===true||node?.kind==='manual-compaction'&&node.data?.command?.outcome===null)return{kind:'compaction',label:copy('正在压缩上下文…','Compacting context…')}
  if(node?.kind==='model-retry')return{kind:'retry',label:copy('正在重试连接…','Retrying connection…')}
  if(node?.kind==='assistant-step'&&['streaming','running','open'].includes(node.data?.status)&&node.data?.blocks?.some(block=>block.kind==='text'&&block.text))return{kind:'reply',label:copy('正在整理回复…','Composing response…')}
  return{kind:'thinking',label:copy('正在思考…','Thinking…')}
 }
 const note=noteRows.filter(row=>['preparing','generating'].includes(row.phase)).at(-1)
 if(note)return{kind:'note',label:note.stage==='validating'?copy('正在检查笔记内容…','Checking note content…'):note.stage==='writing'?copy('正在写入笔记…','Writing note content…'):copy('正在生成笔记内容…','Generating note content…')}
 const canvas=canvasTasks.filter(task=>['running','waiting'].includes(task.state)).at(-1)
 if(canvas)return{kind:'canvas',label:canvas.state==='waiting'?copy('正在等待画布内容更新…','Waiting for canvas updates…'):copy('正在处理画布任务…','Working on the canvas…')}
 // Native component/task projections can be active without a parent model turn.
 const entry=flow.filter(item=>item.kind==='execution'&&item.running).at(-1)
 if(entry?.noteTask)return{kind:'note',label:copy('正在生成笔记内容…','Generating note content…')}
 if(entry?.canvasTask)return{kind:'canvas',label:copy('正在处理画布任务…','Working on the canvas…')}
 return null
}

function ConversationLiveActivity(props) {
 if(props.flow?.some(entry=>entry.kind==='execution'&&entry.running))return null
 const english=document.documentElement.dataset.odysseyLocale==='en'||document.documentElement.lang?.startsWith('en')
 const state=conversationLiveActivity({...props,english,labelForNode:executionActivityLabel,statusForNodes:executionStatusForNodes})
 if(!state)return null
 const parallel=state.parallelCount>1?(english?' · '+state.parallelCount+' actions running':' · '+state.parallelCount+' 项进行中'):''
 return react.createElement('div',{'data-conversation-live-activity':state.kind,role:'status','aria-live':'polite','aria-atomic':true},
  react.createElement('span',null,state.label+parallel))
}
const CSS=statusPresentationCss
const definition=()=>START+'\n'+conversationLiveActivity.toString()+'\n'+ConversationLiveActivity.toString()+'\n'+conversationPublicReplies.toString()+'\n'+ConversationActivityDetails.toString()+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-live-activity-style");if(!style){style=document.createElement("style");style.id="ework-live-activity-style";document.head.appendChild(style)}style.textContent='+JSON.stringify(CSS)+';}\n'+END+'\n'
const CHAT_END='\n\t\t\t\t\t\t]\n\t\t\t\t\t}), (0, react_jsx_runtime.jsx)(OdysseyReadingStatus,'
const CHAT_NEXT=',react.createElement(ConversationLiveActivity,{running,runningTurn:runningTurnNumber,order,nodeStore,flow:nativeSubmittedFlow,noteRows,canvasTasks,openState,t})'+CHAT_END
const SHARED_END="!ongoing&&continuations.length>0&&!tails.length&&react.createElement(MessageIconActions,{text:continuations.at(-1).reason??'',t}))"
const SHARED_LEGACY=SHARED_END.slice(0,-1)+",react.createElement(ConversationLiveActivity,{running,runningTurn,order:slice.keys,nodeStore,canvasTasks:continuations,t}))"
const SHARED_NEXT=SHARED_LEGACY.replace('nodeStore,canvasTasks','nodeStore,flow:body,canvasTasks')
function scope(source,anchor,from,to){const a=source.indexOf(anchor),b=source.indexOf('\n\t\t//#endregion',a);if(a<0||b<a)throw Error('Live activity scope missing: '+anchor);const part=source.slice(a,b);if(part.split(from).length!==2)throw Error('Live activity anchor drifted: '+anchor);return source.slice(0,a)+part.replace(from,to)+source.slice(b)}
export function stripConversationLiveActivity(source){
 const legacy=source.includes(LEGACY),marker=legacy?LEGACY:START,a=source.indexOf(marker)
 if(a<0){if(source.includes('function ConversationLiveActivity('))throw Error('Orphan live activity layer');return source}
 const end=source.indexOf(END,a),block=source.slice(a,end+END.length+1)
 if(source.split(marker).length!==2||source.split(END).length!==2||end<a||(legacy?createHash('sha256').update(block).digest('hex')!=='6e06340806b231098fcb8bcb5757357f79e9c630457e56e07e67b8175c0b09cf':block!==definition()))throw Error('Live activity definition drifted')
 if(!legacy)source=transformStatusPresentation(source,true)
 source=scope(source,'function ChatView(',CHAT_NEXT,CHAT_END)
 source=scope(source,'function SharedResearchRequest(',legacy?SHARED_LEGACY:SHARED_NEXT,SHARED_END)
 return source.replace(block,'')
}

export function patchConversationLiveActivity(source){
 source=transformStatusPresentation(stripConversationLiveActivity(source))
 source=scope(source,'function ChatView(',CHAT_END,CHAT_NEXT)
 source=scope(source,'function SharedResearchRequest(',SHARED_END,SHARED_NEXT)
 const anchor='function SharedResearchRequest(';return source.replace(anchor,definition()+anchor)
}
