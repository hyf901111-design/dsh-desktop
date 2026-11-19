/** Session-independent data adapter for the existing native composer controls. */
export function createPendingComposerPreferences({api,applyModel,savePermission,permissionOptions}){
 const listeners=new Set();let staged,loading,revision=0;
 let snapshot={current:null,routable:null,groups:[],failures:[],status:'idle',error:null};
 const publish=patch=>{snapshot={...snapshot,...patch};for(const fn of listeners)fn()};
 const store={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},getSnapshot:()=>snapshot};
 const value=reply=>{if(!reply?.result?.ok)throw Error(reply?.result?.error?.message||'模型目录暂不可用');return reply.result.value};
 const model={store,load:()=>loading??=(async()=>{
  publish({status:'loading',error:null});const before=revision;
  try{const [catalog,settings]=await Promise.all([api.llm.models({}).then(value),api.settings.describe({}).then(value)]);
   const current=staged??settings.namespaces.find(item=>item.ns==='agent-default-model')?.value??null;
   const view=settings.namespaces.find(item=>item.ns==='permission'),options=view&&permissionOptions?.(view);
   const permissions=options?.length?{currentValue:view.value.defaultPreset,options}:undefined;
   publish({groups:catalog.groups,failures:catalog.failures,current:revision===before?current:staged,permissions,status:'ready',error:null});return snapshot;
  }catch(error){publish({status:'error',error:error.message});throw error}finally{loading=undefined}
 })(),select:async selection=>{if(!selection||typeof selection.provider!=='string'||typeof selection.model!=='string')throw Error('模型选择无效');staged={...selection};revision++;publish({current:staged,status:'ready',error:null});return true}};
 return{model,async setPermission(value){
  if(!snapshot.permissions?.options.some(item=>item.value===value))throw Error('权限选项已变化，请重新选择');
  await savePermission(value);
  if(loading)await loading.catch(()=>{});
  await model.load();
 },async apply(sessionId){
  if(staged){if(applyModel)await applyModel(sessionId,staged);else{const result=await api.sessions.selectModel({sessionId,...staged});if(!result?.result?.ok)throw Error(result?.result?.error?.message||'模型设置未能应用，请重新选择模型。')}}
 }};
}

/** Install the send-time bridge on the same seat the visible preset picker uses. */
export function installPendingPresetFlush(seat, scope, win) {
  const apply = seat.apply.bind(seat)
  let applying
  seat.apply = () => applying ??= apply().finally(() => { applying = undefined })

  const key = Symbol.for('sherlock:pending-preset-flush')
  const flush = async sessionId => {
    const assertCurrent = () => {
      if (scope.sessions.list.getSnapshot().current !== sessionId) throw Error('当前会话已变化')
    }
    assertCurrent()
    await seat.apply()
    // A sessionless list notification can finish after the new session appears.
    if (seat.staged !== undefined) await seat.apply()
    assertCurrent()
    if (seat.selectionFailure?.sessionId === sessionId) throw Error(seat.selectionFailure.message)
  }
  scope.effect(() => {
    win[key] = flush
    const stopReset = scope.on('connection/reset', () => { void seat.load() })
    return () => {
      stopReset()
      if (win[key] === flush) delete win[key]
    }
  }, 'Native pending preset flush')
}

/** Distinguish a failed user selection from an independent roster read. */
export function patchPendingPresetClient(source) {
  const marker = '/* native-pending-preset-flush:v2 */'
  const anchor = 'const seatInjected = () => ({'
  if (source.includes(marker)) return source
  if (source.split(anchor).length !== 2) throw Error('Native pending preset seat drift')
  const legacy = source.indexOf('/* native-pending-preset-flush:v1 */')
  if (legacy !== -1) {
    const end = source.indexOf(anchor, legacy)
    if (end < 0) throw Error('Native pending preset upgrade boundary missing')
    source = source.slice(0, legacy) + source.slice(end)
  }

  const start = source.indexOf('var AgentPresetSeatController = class')
  const end = source.indexOf('\n\t\t};', start)
  if (start < 0 || end < 0) throw Error('Agent preset controller not found')
  let seat = source.slice(start, end)
  const replace = (before, after) => {
    if (seat.split(before).length !== 2) throw Error('Agent preset selection contract changed')
    seat = seat.replace(before, after)
  }
  replace('if (session.agentPreset === staged) {',
    'this.selectionFailure = undefined;\n\t\t\t\tif (session.agentPreset === staged) {')
  for (const message of ['response.result.error.message', 'messageOf(error)']) {
    const footer = 'error: ' + message + ',\n'
    const index = seat.indexOf(footer)
    const call = seat.lastIndexOf('this.set({', index)
    if (index < 0 || call < 0) throw Error('Agent preset error branch missing')
    const indent = seat.slice(seat.lastIndexOf('\n', call) + 1, call)
    const statement = seat.slice(call, index + footer.length)
    replace(statement, 'this.selectionFailure = { sessionId: session.id, message: ' + message + ' };\n' + indent + statement)
  }
  source = source.slice(0, start) + seat + source.slice(end)
  return source.replace(anchor, () => marker + '\n(' + installPendingPresetFlush.toString() + ')(seat, scope, window);\n' + anchor)
}
