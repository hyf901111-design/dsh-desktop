/** A single queue owns the journal and semantic state of one Conversation card. */
export function createConversationHtmlInteraction({bridge,sessionId,componentId,html,initial,read,update,current,createJournal,createShared,status}){
 let queue=Promise.resolve(),closed=false,pending=0,failed=false
 const sameView=view=>view?.id===componentId&&view.sessionId===sessionId&&view.node?.containerSpec?.type==='html'&&view.node.containerSpec.html===html
 const target=()=>{const view=read();if(closed||!current()||!sameView(view)||view.readOnly===true||typeof bridge?.commitHtmlInteraction!=='function')throw Error('对话组件已变化或当前不可编辑。');return view}
 const enqueue=(kind,version,value)=>{
  let packet;try{packet=JSON.parse(JSON.stringify(value))}catch{return Promise.reject(Error('组件交互参数无效。'))}
  pending++;status?.('saving')
  const perform=async()=>{
   try{
    const before=target()
    const saved=await bridge.commitHtmlInteraction({sessionId,componentId,expectedRevision:before.revision,htmlVersion:version,kind,...packet})
    const latest=target()
    if(!sameView(saved)||saved.revision<before.revision||saved.revision<latest.revision)throw Error('对话组件宿主身份已变化，本次确认已取消。')
    update(saved);failed=false
    return saved.node.config?.[kind==='journal'?'interactionState':'sharedComponentState']
   }catch(error){
    failed=true
    // Readback never replays a write. A prior durable commit may have outlived
    // a lost acknowledgement; keep its actual revision for the next attempt.
    if(!closed&&current()&&typeof bridge?.read==='function')try{const latest=await bridge.read({sessionId,componentId});if(!closed&&current()&&sameView(latest)&&sameView(read())&&latest.revision>=read().revision)update(latest)}catch{}
    if(!closed&&current())status?.('error',error)
    throw error
   }
  }
  const result=queue.then(perform);queue=result.catch(()=>{})
  return result.finally(()=>{pending--;if(!closed&&current()&&!pending&&!failed)status?.('saved')})
 }
 const journal=createJournal(initial?.interactionState,(version,event)=>enqueue('journal',version,{event}))
 const shared=createShared(initial?.sharedComponentState,(version,revision,state)=>enqueue('shared',version,{revision,state}))
 return{bridge:journal,sharedBridge:shared,
  commitPresentation(write){
   // A theme also advances the component revision. Keep it in the existing
   // queue so neither side overtakes an unacknowledged HTML interaction.
   const result=queue.then(async()=>{target();if(failed)throw Error('组件交互尚未保存，请先保存后再切换模式。');return write()})
   queue=result.catch(()=>{});return result
  },
  observe(config){journal.observe(config?.interactionState);shared.observe(config?.sharedComponentState)},dispose(){closed=true;journal.dispose();shared.dispose()}}
}
