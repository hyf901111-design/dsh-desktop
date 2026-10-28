type Surface='research'|'notes'
export function createComponentDataBridge(ipc:{on(channel:string,listener:any):unknown;removeListener(channel:string,listener:any):unknown;invoke(channel:string,...args:any[]):Promise<any>},notesRequest:(method:string,input:any)=>Promise<any>,owns:(sessionId:string,owner:string)=>boolean){
 return Object.freeze({
  subscribe(callback:(value:unknown)=>void,surface:Surface='research'){
   if(!['research','notes'].includes(surface))return()=>{}
   const channel=surface==='notes'?'notes:component-data-status':'component-data:status'
   const listener=(_event:unknown,value:any)=>{if(surface==='notes'&&(!value?.owner||!owns(value.sessionId,value.owner)))return;callback(value)}
   ipc.on(channel,listener);return()=>ipc.removeListener(channel,listener)
  },
  request(sessionId:string,args:unknown){
   const value=args&&typeof args==='object'?args as Record<string,unknown>:undefined,surface=value?.surface??'research'
   if(surface==='notes')return value?.action==='list'?notesRequest('component-data-status',{sessionId}).then(result=>{if(!result||typeof result.owner!=='string'||!result.owner||!owns(sessionId,result.owner)||!Array.isArray(result.rows))throw Error('笔记状态请求已过期。');return result.rows}):Promise.reject(Error('笔记状态接口仅支持读取。'))
   if(surface!=='research')return Promise.reject(Error('组件状态所属模式无效。'))
   return ipc.invoke('component-data:request',sessionId,args)
  },
  setVisible:(sessionId:string,active:boolean)=>ipc.invoke('component-data:visibility',sessionId,active)
 })
}
