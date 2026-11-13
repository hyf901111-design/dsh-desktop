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

/** Await the same preset seat that the native project row already renders. */
export function patchPendingPresetClient(source){
 const marker='/* native-pending-preset-flush:v1 */';if(source.includes(marker))return source;
 const anchor='const seatInjected = () => ({';if(source.split(anchor).length!==2)throw Error('Native pending preset seat drift');
 return source.replace(anchor,`${marker}
 const nativeApply=seat.apply.bind(seat);let applying=null;
 seat.apply=()=>applying??=(async()=>{await nativeApply()})().finally(()=>{applying=null});
 const flush=async sessionId=>{if(scope.sessions.list.getSnapshot().current!==sessionId)throw Error('当前会话已变化');await seat.apply();if(seat.staged!==undefined)await seat.apply();const error=seat.store.getSnapshot().error;if(error)throw Error(error);if(scope.sessions.list.getSnapshot().current!==sessionId)throw Error('当前会话已变化')};
 scope.effect(()=>{const key=Symbol.for('sherlock:pending-preset-flush');window[key]=flush;return()=>{if(window[key]===flush)delete window[key]}},'Native pending preset flush');
 `+anchor);
}
