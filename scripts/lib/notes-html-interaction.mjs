import {parse} from '@babel/parser'
import {parseWorkbenchRestore,serializeWorkbenchRestore} from './workbench-restore-codec.mjs'
import {sharedComponentRuntime} from '../../packages/dsh-research-task-runtime/shared-component-runtime.js'
import {RESEARCH_HTML_INTERACTION_RUNTIME} from '../../packages/dsh-research-task-runtime/html-artifact.js'
/** State snapshots are published only after the Notes persister acknowledges. */
export function createNoteHtmlSharedStateBridge(initial,request){
 let snapshot=initial,observed=initial,confirmed=initial,pending=0,closed=false,sequence=0,lastAck=0,awaiting=false
 const listeners=new Set(),rejected=new Set(),key=value=>JSON.stringify(value)
 const publish=value=>{if(key(snapshot)===key(value))return;snapshot=value;for(const listener of listeners)listener()}
 const reconcile=()=>{if(!closed&&!pending&&!awaiting)publish(rejected.has(key(observed))?confirmed:observed)}
 return {subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},snapshot:()=>snapshot,
  observe(value){observed=value;if(awaiting&&key(value)===key(confirmed))awaiting=false;reconcile()},
  async commit(version,revision,state){
   if(closed||typeof version!=='string'||!Number.isSafeInteger(revision)||revision<1)return
   const attempt=++sequence;pending++
   try{
    const saved=await request(version,revision,state)
    if(closed||saved?.version!==version||saved.revision!==revision||key(saved.state)!==key(state))throw Error('笔记交互未确认保存。')
    rejected.delete(key(saved))
    if(attempt>lastAck){lastAck=attempt;confirmed=saved;awaiting=key(observed)!==key(saved);publish(saved)}
    return saved
   }catch{rejected.add(key({version,revision,state}));return}
   finally{pending--;reconcile()}
  },dispose(){closed=true;listeners.clear()}}
}
/** Only confirmed Notes saves become iframe acknowledgements. */
export function createNoteHtmlInteractionBridge(initial,request){
 let snapshot=initial,observed=initial,confirmed=initial,pending=0,closed=false,sequence=0,lastAck=0,awaitingObservation=false
 const listeners=new Set(),rejected=new Set()
 const fingerprint=value=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])))
 const includes=(whole,part)=>whole?.version===part?.version&&Object.entries(part?.events??{}).every(([id,event])=>Object.hasOwn(whole?.events??{},id)&&fingerprint(whole.events[id])===fingerprint(event))
 const publish=state=>{if(snapshot===state)return;snapshot=state;for(const listener of listeners)listener()}
 const withoutRejected=state=>state?.events&&rejected.size?{...state,events:Object.fromEntries(Object.entries(state.events).filter(([id])=>!rejected.has(id)))}:state
 return {
  subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},
  snapshot:()=>snapshot,
  observe(state){
   observed=state
   if(awaitingObservation&&includes(state,confirmed))awaitingObservation=false
   // A save ACK can beat React's node publication. Once that publication has
   // caught up, later edits (including Undo) are authoritative again.
   if(!pending&&!awaitingObservation&&!closed)publish(withoutRejected(state))
  },
  async commit(version,event){
   if(closed||typeof version!=='string'||!event||typeof event.id!=='string')return false
   const attempt=++sequence;pending++
   try{
    const state=await request(version,event)
    if(closed||state?.version!==version||!Object.hasOwn(state.events??{},event.id)||fingerprint(state.events[event.id])!==fingerprint(event))throw Error('笔记交互尚未保存。')
    if(attempt>=lastAck){
     lastAck=attempt;confirmed=state
     for(const id of Object.keys(state.events))rejected.delete(id)
     awaitingObservation=!includes(observed,state)
     publish(state)
    }
    return true
   }catch{if(!Object.hasOwn(confirmed?.events??{},event.id))rejected.add(event.id);return false}
   finally{pending--;if(!pending&&!awaitingObservation&&!closed)publish(withoutRejected(observed))}
  },
  dispose(){closed=true;listeners.clear()}
 }
}

function patchNoteHtmlRenderer(renderer,normalizeFrame=true){
 const once=(a,b)=>{if(renderer.split(a).length!==2)throw Error('Notes HTML interaction anchor missing or ambiguous: '+a.slice(0,100));renderer=renderer.replace(a,b)}
 if(!renderer.includes('const noteHtmlInteraction=react.useContext(eworkNoteHtmlInteractionContext);')){
 once('const interactionReadOnly=sherlockShared(interactionSessionId)&&sherlockBoardsAdapter?.getView(interactionSessionId)?.permissions.edit!==true;',`const noteHtmlInteraction=react.useContext(eworkNoteHtmlInteractionContext);
    const interactionReadOnly=noteHtmlInteraction?noteHtmlInteraction.readOnly:sherlockShared(interactionSessionId)&&sherlockBoardsAdapter?.getView(interactionSessionId)?.permissions.edit!==true;`)
 once('interactionRef.current={node,readOnly:interactionReadOnly,sessionId:interactionSessionId};','interactionRef.current={node,readOnly:interactionReadOnly,sessionId:interactionSessionId,noteHtmlInteraction};')
 once('const saved=current.node.config?.interactionState;','const saved=current.noteHtmlInteraction?current.noteHtmlInteraction.state:current.node.config?.interactionState;')
 once('[node.config?.interactionState,interactionReadOnly]);','[node.config?.interactionState,interactionReadOnly,noteHtmlInteraction?.state]);')
 once("if(data.type==='sherlock-interaction-event'){\n      const c=interactionRef.current;",`if(data.type==='sherlock-interaction-event'){
      const c=interactionRef.current;
      if(c.noteHtmlInteraction){
        const bridge=c.noteHtmlInteraction.bridge,windowRef=frameRef.current?.contentWindow,html=c.node.containerSpec.html;
        const reject=()=>{if(frameRef.current?.contentWindow===windowRef&&interactionRef.current.noteHtmlInteraction?.bridge===bridge&&interactionRef.current.node.containerSpec.html===html)sendInteraction(data.event?.id)};
        if(c.readOnly){reject();return}
        void bridge.commit(researchInteractionVersion(html),data.event).then(ok=>{if(ok!==true)reject()}).catch(reject);
        return;
      }`)
 }
 if(!renderer.includes('localAck:true')){
  once('const c=interactionRef.current, v=sherlockBoardsAdapter?.getView(c.sessionId);',`const c=interactionRef.current, v=sherlockBoardsAdapter?.getView(c.sessionId);
      if(c.noteHtmlInteraction)return {type:'sherlock-component-context',shared:false,online:false,localAck:true,readOnly:c.readOnly,saved:c.noteHtmlInteraction.sharedState?.version===researchInteractionVersion(c.node.containerSpec.html)?c.noteHtmlInteraction.sharedState:undefined};`)
  once("if(m.op==='localCommit'){",`if(m.op==='localCommit'){
        if(c.noteHtmlInteraction){
          const bridge=c.noteHtmlInteraction.sharedBridge,windowRef=frameRef.current?.contentWindow,html=c.node.containerSpec.html;
          const reply=saved=>{if(frameRef.current?.contentWindow===windowRef&&interactionRef.current.noteHtmlInteraction?.sharedBridge===bridge&&interactionRef.current.node.containerSpec.html===html)windowRef?.postMessage({type:'sherlock-component-receive',message:{peerId:m.peerId,kind:'local-commit',commitId:m.commitId,ok:!!saved,...(saved?{state:saved.state,revision:saved.revision}:{})}},'*');};
          if(c.readOnly||typeof m.peerId!=='string'||m.peerId.length>128||typeof m.commitId!=='string'||m.commitId.length>128){reply();return;}
          void bridge.commit(researchInteractionVersion(html),m.revision,m.state).then(reply).catch(()=>reply());return;
        }`)
 }
 const journalMessage='readOnly:current.readOnly,...(typeof rejectedEventId'
 const spreadsheetJournalMessage="readOnly:current.readOnly,...(current.noteHtmlInteraction?.surface==='spreadsheet'?{localDisclosures:true}:{}),...(typeof rejectedEventId"
 if(!renderer.includes(spreadsheetJournalMessage))once(journalMessage,spreadsheetJournalMessage)
 if(normalizeFrame){
  const before='srcDoc, onLoad: sendTheme, style: { flex: 1, minWidth: 0, minHeight: 0 }',after="srcDoc, onLoad: sendTheme, style: { flex: 1, minWidth: 0, minHeight: 0, border: 0, display: 'block', boxSizing: 'border-box', background: 'transparent' }"
  if(renderer.split(before).length+renderer.split(after).length!==3)throw Error('Notes HTML frame style anchor missing or ambiguous')
  if(renderer.includes(before))once(before,after)
 }
 return renderer
}

export function patchNotesHtmlInteraction(source,noteViewSource){
 const marker='/* sherlock:notes-html-interaction:v1 */'
 const installed=source.includes(marker)
 const functions=[]
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&['ResearchHtmlArtifact','EWorkNoteComponentView','createNoteHtmlInteractionBridge'].includes(node.id?.name))functions.push(node);for(const [key,value] of Object.entries(node)){if(['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}}
 visit(parse(source,{sourceType:'unambiguous'}))
 const renderers=functions.filter(node=>node.id.name==='ResearchHtmlArtifact')
 if(renderers.length!==1)throw Error('Notes HTML renderer missing or ambiguous')
 const target=renderers[0],previousRenderer=source.slice(target.start,target.end),renderer=patchNoteHtmlRenderer(previousRenderer)
 const edits=[{start:target.start,end:target.end,text:renderer}]
 const runtimes=[];const collectRuntime=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='sharedComponentRuntime')runtimes.push(node);for(const[key,value]of Object.entries(node)){if(['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value))value.forEach(collectRuntime);else if(value&&typeof value==='object')collectRuntime(value)}}
 collectRuntime(parse(source,{sourceType:'unambiguous'}));if(runtimes.length!==1)throw Error('Notes shared runtime missing or ambiguous')
 edits.push({start:runtimes[0].start,end:runtimes[0].end,text:sharedComponentRuntime.toString()})
 const serialized=[];const collectSerialized=node=>{if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name==='RESEARCH_HTML_INTERACTION_RUNTIME')serialized.push({start:node.init.start,end:node.init.end,text:JSON.stringify(RESEARCH_HTML_INTERACTION_RUNTIME)});if(node.type==='FunctionDeclaration'&&node.id?.name==='buildResearchHtmlPreview'){
  let text=source.slice(node.start,node.end)
  if(!text.includes('semantic={events:new WeakSet()}')){
   const replace=(before,after)=>{if(text.split(before).length!==2)throw Error('Notes sandbox runtime anchor missing or ambiguous');text=text.replace(before,after)}
   replace('const authorizedEvents=new WeakSet();','const authorizedEvents=new WeakSet(),semantic={events:new WeakSet()};')
   replace('${RESEARCH_HTML_INTERACTION_RUNTIME})(authorizedEvents);','${RESEARCH_HTML_INTERACTION_RUNTIME})(authorizedEvents,semantic);')
   replace('${sharedComponentRuntime.toString()})();','${sharedComponentRuntime.toString()})(semantic);')
  }
  serialized.push({start:node.start,end:node.end,text})
 }for(const[key,value]of Object.entries(node)){if(['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value))value.forEach(collectSerialized);else if(value&&typeof value==='object')collectSerialized(value)}}
 collectSerialized(parse(source,{sourceType:'unambiguous'}));if(serialized.length!==2)throw Error('Notes sandbox runtime missing or ambiguous');edits.push(...serialized)
 const tag='/* EWORK_GRID_RESTORE ',recordStart=source.indexOf(tag,target.end)
 if(recordStart>=0){
  const recordEnd=source.indexOf(' */',recordStart+tag.length)
  if(recordEnd<0)throw Error('Notes HTML restore record incomplete')
  const record=source.slice(recordStart+tag.length,recordEnd),changes=parseWorkbenchRestore(record)
  const entries=changes.filter(([before,after])=>before.trimStart().startsWith('function ResearchHtmlArtifact(')&&after.trimStart().startsWith('function ResearchHtmlArtifact('))
  if(entries.length!==1)throw Error('Notes HTML restore record missing or ambiguous')
  if((entries[0][2]??1)!==1)throw Error('Notes HTML restore renderer must be unique')
  const entry=entries[0],knownAfter=patchNoteHtmlRenderer(entry[1],false),nextAfter=patchNoteHtmlRenderer(entry[1])
  if(previousRenderer.trimEnd()!==entry[1].trimEnd()&&previousRenderer.trimEnd()!==knownAfter.trimEnd()&&previousRenderer.trimEnd()!==nextAfter.trimEnd())throw Error('Notes HTML restore record changed')
  entry[0]=patchNoteHtmlRenderer(entry[0]);entry[1]=nextAfter
  // Preserve legacy records for older independent restore consumers.
  edits.push({start:recordStart+tag.length,end:recordEnd,text:record.trimStart().startsWith('[')?JSON.stringify(changes).replaceAll('*/','*\\/'):serializeWorkbenchRestore(changes)})
 }

 if(!functions.some(node=>node.id.name==='createNoteHtmlInteractionBridge')){
  const views=functions.filter(node=>node.id.name==='EWorkNoteComponentView')
  if(views.length!==1||typeof noteViewSource!=='string')throw Error('Notes HTML view missing or ambiguous')
  edits.push({start:views[0].start,end:views[0].end,text:'const eworkNoteHtmlInteractionContext=react.createContext(null);\n'+createNoteHtmlInteractionBridge.toString()+'\n'+createNoteHtmlSharedStateBridge.toString()+'\nconst eworkCreateNoteHtmlInteraction=createNoteHtmlInteractionBridge;const eworkCreateNoteHtmlSharedState=createNoteHtmlSharedStateBridge;\n'+noteViewSource})
 }else{
  const views=functions.filter(node=>node.id.name==='EWorkNoteComponentView')
  if(views.length!==1||typeof noteViewSource!=='string')throw Error('Notes HTML view missing or ambiguous')
  const shared=[];const collectShared=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='createNoteHtmlSharedStateBridge')shared.push(node);for(const[key,value]of Object.entries(node)){if(['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;if(Array.isArray(value))value.forEach(collectShared);else if(value&&typeof value==='object')collectShared(value)}}
  collectShared(parse(source,{sourceType:'unambiguous'}));if(shared.length>1)throw Error('Notes shared bridge ambiguous')
  const prefix=shared.length?'':createNoteHtmlSharedStateBridge.toString()+'\nconst eworkCreateNoteHtmlSharedState=createNoteHtmlSharedStateBridge;\n'
  edits.push({start:views[0].start,end:views[0].end,text:prefix+noteViewSource})
  if(shared.length)edits.push({start:shared[0].start,end:shared[0].end,text:createNoteHtmlSharedStateBridge.toString()})
 }
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end)
 return source+(installed?'':'\n'+marker)
}
