import {parse} from '@babel/parser'
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

function patchNoteHtmlRenderer(renderer){
 if(renderer.includes('const noteHtmlInteraction=react.useContext(eworkNoteHtmlInteractionContext);'))return renderer
 const once=(a,b)=>{if(renderer.split(a).length!==2)throw Error('Notes HTML interaction anchor missing or ambiguous: '+a.slice(0,100));renderer=renderer.replace(a,b)}
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
 const tag='/* EWORK_GRID_RESTORE ',recordStart=source.indexOf(tag,target.end)
 if(recordStart>=0){
  const recordEnd=source.indexOf(' */',recordStart+tag.length)
  if(recordEnd<0)throw Error('Notes HTML restore record incomplete')
  const changes=JSON.parse(source.slice(recordStart+tag.length,recordEnd))
  if(!Array.isArray(changes)||changes.some(entry=>!Array.isArray(entry)||entry.length!==2||entry.some(value=>typeof value!=='string')))throw Error('Notes HTML restore record invalid')
  const entries=changes.filter(([before,after])=>before.trimStart().startsWith('function ResearchHtmlArtifact(')&&after.trimStart().startsWith('function ResearchHtmlArtifact('))
  if(entries.length!==1)throw Error('Notes HTML restore record missing or ambiguous')
  const entry=entries[0],nextAfter=patchNoteHtmlRenderer(entry[1])
  if(previousRenderer.trimEnd()!==entry[1].trimEnd()&&previousRenderer.trimEnd()!==nextAfter.trimEnd())throw Error('Notes HTML restore record changed')
  entry[0]=patchNoteHtmlRenderer(entry[0]);entry[1]=nextAfter
  edits.push({start:recordStart+tag.length,end:recordEnd,text:JSON.stringify(changes).replaceAll('*/','*\\/')})
 }

 if(!functions.some(node=>node.id.name==='createNoteHtmlInteractionBridge')){
  const views=functions.filter(node=>node.id.name==='EWorkNoteComponentView')
  if(views.length!==1||typeof noteViewSource!=='string')throw Error('Notes HTML view missing or ambiguous')
  edits.push({start:views[0].start,end:views[0].end,text:'const eworkNoteHtmlInteractionContext=react.createContext(null);\n'+createNoteHtmlInteractionBridge.toString()+'\nconst eworkCreateNoteHtmlInteraction=createNoteHtmlInteractionBridge;\n'+noteViewSource})
 }
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end)
 return source+(installed?'':'\n'+marker)
}
