// Environment-independent protocol. Components contribute writable fields via
// describe/validate; neither natural-language intents nor component types live here.
export function createCanvasActionController(adapter) {
  const clone = value => JSON.parse(JSON.stringify(value))
  const fail = message => { throw Error(message) }
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256
  let signature, revision, lastAction, busy = false
  const receipts = new Map()
  const presentationFields = () => typeof adapter.applyPresentation === 'function' ? adapter.describePresentation?.() ?? {} : {}
  const signatureFor = state => JSON.stringify([state.files, state.artifacts, adapter.presentation?.()])
  const read = () => {
    const state = adapter.snapshot()
    const next = signatureFor(state)
    if (next !== signature) { signature = next; revision = crypto.randomUUID() }
    return state
  }
  const checkRevision = value => { read(); if (value !== revision) fail('画板已经变化，请重新查看后再操作。') }
  const fieldsFor = (node, collection) => ({
    ...Object.fromEntries(['x','y','width','height'].map(key => [key,{type:'number',minimum:key==='width'||key==='height'?80:-100000,maximum:100000}])),
    ...adapter.describe(node, collection)
  })
  const inspect = async (args = {}) => {
    const state = read(), selected = new Set(args.ids ?? [])
    if (!object(args) || Object.keys(args).some(k=>k!=='ids') || !Array.isArray(args.ids??[]) || selected.size > 1000) fail('查看参数无效。')
    const nodes = [...state.files.map(n=>[n,'files']), ...state.artifacts.map(n=>[n,'artifacts'])]
    if ([...selected].some(key=>!nodes.some(([n])=>n.id===key))) fail('组件不存在，请重新查看。')
    const presentation=adapter.presentation?.(), fields=presentationFields()
    return { revision, writable:adapter.canWrite(), selectedIds:[...state.selection.selectedNodeIds], total:nodes.length,
      operations:['remove','update','arrange',...(Object.keys(fields).length?['presentation']:[])],
      ...(Object.keys(fields).length?{presentation:clone(presentation),presentationFields:clone(fields),presentationWritable:adapter.canWrite()||adapter.canChangePresentation?.()===true}:{}),
      undoActionId:lastAction?.revision===revision?lastAction.actionId:null,
      nodes:nodes.filter(([n])=>!selected.size||selected.has(n.id)).map(([n,collection])=>{
        const fields=fieldsFor(n,collection)
        const content=Object.fromEntries(Object.keys(fields).filter(k=>!['x','y','width','height','title'].includes(k)).map(k=>[k,n[k]]))
        return {id:n.id,title:n.displayName??n.title??n.name,kind:n.kind??'file',bounds:{x:n.x,y:n.y,width:n.width,height:n.height},capabilities:{remove:true,fields},...(selected.size?{content:clone(content)}:{})}
      }) }
  }
  const validateValue = (value, schema) => {
    if (schema.type === 'string' && (typeof value !== 'string' || !value.trim() || value.length > (schema.maxLength??120000))) fail('文字内容为空或超过限制。')
    if (schema.type === 'number' && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) fail('组件尺寸或坐标无效。')
    if (schema.type === 'object' && !object(value)) fail('组件内容结构无效。')
    if (schema.enum && !schema.enum.includes(value)) fail('字段取值不在声明的选项中。')
  }
  const mutate = async (kind, args, options = {}) => {
    const checkCancelled=()=>{if(options.isCancelled?.())fail('画布操作已取消。')}
    checkCancelled()
    if (!object(args) || !id(args.requestId) || !id(args.revision)) fail('操作参数无效。')
    if (JSON.stringify(args).length > 1500000) fail('画布变更过大，请减少单次内容。')
    const fingerprint=JSON.stringify([kind,args]), prior=receipts.get(args.requestId)
    if (prior) { if(prior.fingerprint!==fingerprint) fail('操作标识已被其他请求使用。');return clone(prior.result) }
    if (busy) fail('画板正在执行另一项操作，请稍后重试。')
    const presentationOnly=kind==='apply'&&Array.isArray(args.changes)&&args.changes.length===1&&args.changes[0]?.op==='presentation'
    const allowed=()=>adapter.canWrite()||presentationOnly&&adapter.canChangePresentation?.()===true
    if (!allowed()) fail('当前画板不可编辑。')
    busy=true
    try {
      // Local presentation does not flush or mutate the shared board document.
      // Its adapter grants access separately from document editing permission.
      if(presentationOnly)await adapter.readyPresentation?.();else await adapter.ready?.()
      checkCancelled()
      if (!allowed()) fail('当前画板不可编辑。')
      checkRevision(args.revision)
      const before=read()
      checkCancelled()
      let changedIds=[], updatedPresentation, canUndo=kind!=='undo'
      if(kind==='undo') {
        if (Object.keys(args).some(k=>!['requestId','revision','actionId'].includes(k)) || !lastAction || lastAction.actionId!==args.actionId || lastAction.revision!==revision) fail('该操作已无法直接撤销，请查看最新画板。')
        if (!await adapter.undo()) fail('当前操作无法撤销。')
        lastAction=null
      } else {
        if(Object.keys(args).some(k=>!['requestId','revision','changes'].includes(k)) || !Array.isArray(args.changes) || !args.changes.length || args.changes.length>1000) fail('变更列表无效。')
        if (args.changes.some(change => change?.op === 'arrange') && args.changes.length !== 1)
          fail('自动整理不能与坐标、尺寸或内容修改同批执行；请只提交 arrange，或只提交明确的更新。')
        const presentationChange=args.changes.find(change=>change?.op==='presentation')
        if(presentationChange && args.changes.length!==1)fail('看板样式必须单独提交；请先完成样式修改，再重新查看后提交其他变更。')
        let next=clone(before)
        for(const change of args.changes) {
          if (!object(change)) fail('变更无效。')
          if(change.op==='presentation') {
            if(Object.keys(change).some(key=>!['op','fields'].includes(key)) || !object(change.fields) || !Object.keys(change.fields).length)fail('看板样式字段无效。')
            const fields=presentationFields()
            for(const [key,value] of Object.entries(change.fields)){
              if(!Object.hasOwn(fields,key)||['__proto__','constructor','prototype'].includes(key))fail('画板未声明此样式的编辑能力。')
              validateValue(value,fields[key])
            }
          } else if(change.op==='remove') {
            if(Object.keys(change).some(k=>!['op','ids'].includes(k)) || !Array.isArray(change.ids) || !change.ids.length || change.ids.some(key=>!id(key))) fail('删除目标无效。')
            const targets=new Set(change.ids),all=[...next.files,...next.artifacts]
            if([...targets].some(key=>!all.some(n=>n.id===key))) fail('组件不存在，请重新查看。')
            changedIds.push(...targets)
            for(const collection of ['files','artifacts'])next[collection]=next[collection].filter(n=>!targets.has(n.id))
          } else if(change.op==='update') {
            if(Object.keys(change).some(k=>!['op','id','fields'].includes(k)) || !object(change.fields) || !Object.keys(change.fields).length) fail('修改字段无效。')
            const collection=next.files.some(n=>n.id===change.id)?'files':'artifacts',index=next[collection].findIndex(n=>n.id===change.id)
            if(index<0)fail('组件不存在，请重新查看。')
            const node=next[collection][index],fields=fieldsFor(node,collection)
            for(const [key,value] of Object.entries(change.fields)) {
              if(!Object.hasOwn(fields,key) || ['__proto__','constructor','prototype'].includes(key)) fail('组件未声明此字段的编辑能力。')
              validateValue(value,fields[key])
            }
            next[collection][index]=adapter.validate({...node,...clone(change.fields)},collection,change.fields)
            if(!next[collection][index] || next[collection][index].id!==node.id)fail('组件内容不兼容。')
            changedIds.push(node.id)
          } else if(change.op==='arrange') {
            if(Object.keys(change).some(k=>k!=='op'))fail('自动整理不接受额外参数；自定义布局请修改坐标。')
            next={...next,...adapter.arrange(next)}
            changedIds.push(...next.files.map(n=>n.id),...next.artifacts.map(n=>n.id))
          } else fail('不支持的操作，请使用画布声明的操作。')
        }
        const ids=new Set([...next.files,...next.artifacts].map(n=>n.id))
        next.selection={selectedNodeIds:next.selection.selectedNodeIds.filter(key=>ids.has(key)),orderedFileIds:next.selection.orderedFileIds.filter(key=>ids.has(key))}
        checkRevision(args.revision)
        checkCancelled()
        if(presentationChange){
          const changed=await adapter.applyPresentation(clone(presentationChange.fields))
          updatedPresentation=adapter.presentation?.()
          if(!updatedPresentation||Object.entries(presentationChange.fields).some(([key,value])=>updatedPresentation[key]!==value))fail('看板样式未应用，请重新查看当前状态。')
          if(changed===false)return {status:'unchanged',revision,changedIds:[],presentation:clone(updatedPresentation),canUndo:false}
          canUndo=false;lastAction=null
        } else {
          if(signatureFor(next)===signature)return {status:'unchanged',revision,changedIds:[]}
          await adapter.commit(next,before)
        }
      }
      read()
      const result={status:'pending',actionId:args.requestId,revision,changedIds:[...new Set(changedIds)],canUndo,...(updatedPresentation?{presentation:clone(updatedPresentation)}:{})}
      if(canUndo)lastAction={actionId:args.requestId,revision}
      receipts.set(args.requestId,{fingerprint,result})
      if(receipts.size>100)receipts.delete(receipts.keys().next().value)
      try {if(!updatedPresentation)await adapter.flush?.();result.status='applied'} catch {result.status='pending';result.message='变更已在本地应用，同步尚未确认。请勿重复提交；可重新查看状态。'}
      read();result.revision=revision
      // Do not extend undo authority over edits made while synchronization awaited.
      return clone(result)
    } finally {busy=false}
  }
  return {inspect,apply:(args,options)=>mutate('apply',args,options),undo:(args,options)=>mutate('undo',args,options)}
}
