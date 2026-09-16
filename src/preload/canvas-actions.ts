type Ipc={invoke(channel:string,value:unknown):Promise<unknown>;on(channel:string,listener:(event:unknown,value:any)=>void):unknown;removeListener(channel:string,listener:(event:unknown,value:any)=>void):unknown}
export function createCanvasActionsBridge(ipc:Ipc){
 return Object.freeze({
  bind:(value:{sessionId:string;selectedIds:string[]})=>ipc.invoke('research:canvas-actions:bind',value),
  subscribe:(handler:(value:any)=>Promise<unknown>)=>{
   const cancelled=new Set<string>(),active=new Set<string>()
   const listener=(_event:unknown,value:any)=>{
    if(value?.cancel){if(active.has(value.requestId))cancelled.add(value.requestId);return}
    if(value?.expiresAt<Date.now())return
    active.add(value.requestId)
    Promise.resolve().then(()=>handler({...value,isCancelled:()=>cancelled.has(value.requestId)||value.expiresAt<Date.now()})).then(result=>ipc.invoke('research:canvas-actions:reply',{requestId:value.requestId,sessionId:value.sessionId,result}),error=>ipc.invoke('research:canvas-actions:reply',{requestId:value.requestId,sessionId:value.sessionId,error:error instanceof Error?error.message:'画布操作失败。'})).catch(()=>{}).finally(()=>{cancelled.delete(value.requestId);active.delete(value.requestId)})
   }
   ipc.on('research:canvas-actions:request',listener)
   return ()=>ipc.removeListener('research:canvas-actions:request',listener)
  }
 })
}
