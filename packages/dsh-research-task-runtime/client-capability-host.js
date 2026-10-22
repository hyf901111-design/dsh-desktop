import {createClientCapabilityRegistry,createCapabilityExecutor} from './client-capabilities.js'
import {acceptArtifactOutput} from './artifact-output.js'
// Both Notes and Harness use this factory; no transport, model or arbitrary IPC
// names enter the registry. Canvas mutations retain the existing host CAS.
export function createClientCapabilityHost({current,handlers={},canvas,window,navigate}){
 const runCanvas=async(method,args,context,signal,requestId)=>{
  signal?.throwIfAborted()
  const input=method==='apply'?{requestId,revision:args.revision,changes:args.operations.map(change=>{
   const spec=change.op==='update'?change.fields?.containerSpec:undefined
   if(!spec||!['market','kpi','chart','table'].includes(spec.type))return change
   const result=acceptArtifactOutput(JSON.stringify(spec));if(!result)throw Error('组件数据不符合现有模板。')
   return {...change,fields:{...change.fields,containerSpec:JSON.parse(result)}}
  })}:method==='undo'?{requestId,...args}:args
  const data=await canvas(method,input,context,signal)
  const status=data?.status==='pending'?'pending':['failed','cancelled','unavailable'].includes(data?.status)?data.status:'succeeded'
  return{status,data,...typeof data?.message==='string'?{message:data.message}:{}}
 }
 const invoke=(action)=>async(args,context,signal)=>{signal?.throwIfAborted();return{status:'succeeded',data:await window(action,args,context,signal)}}
 const registry=createClientCapabilityRegistry({...handlers,...canvas?{inspectCanvas:(...a)=>runCanvas('inspect',...a),applyCanvas:(...a)=>runCanvas('apply',...a),undoCanvas:(...a)=>runCanvas('undo',...a)}:{},...window?{resetZoom:invoke('zoom-reset'),zoomIn:invoke('zoom-in'),zoomOut:invoke('zoom-out'),setFullscreen:invoke('fullscreen')}:{},...navigate?{setMode:async(args,context,signal)=>({status:'succeeded',data:await navigate(args.mode,context,signal)})}:{}})
 return{registry,executor:createCapabilityExecutor(registry,current)}
}
