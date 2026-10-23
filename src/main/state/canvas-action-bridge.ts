import { randomUUID } from 'node:crypto'
import { registerTrustedMainWindowHandler, type TrustedWindow, type TrustedWindowEvent } from '../ipc-trust'
type Binding = { selectedIds: string[]; expires: number }
type Pending = {sessionId:string; resolve(value:unknown):void; reject(error:Error):void; timer:ReturnType<typeof setTimeout>;cleanup():void}
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=256
export class CanvasActionBridge {
  private bindings=new Map<string,Binding>()
  private pending=new Map<string,Pending>()
  private stopped=false
  constructor(private options:{send(value:unknown):void;canRead(sessionId:string):boolean}){}
  bind(value:any): {ok:true} {
    if(this.stopped||!validId(value?.sessionId)||!Array.isArray(value.selectedIds)||value.selectedIds.length>1000||!value.selectedIds.every(validId)||!this.options.canRead(value.sessionId))throw Error('画板绑定不可用。')
    for(const [key,b]of this.bindings)if(b.expires<Date.now())this.bindings.delete(key)
    if(this.bindings.size>=100)this.bindings.delete(this.bindings.keys().next().value!)
    this.bindings.set(value.sessionId,{selectedIds:[...value.selectedIds],expires:Date.now()+30*60*1000})
    return {ok:true}
  }
  isAvailable(sessionId:string):boolean {const binding=this.bindings.get(sessionId);return !this.stopped&&!!binding&&binding.expires>=Date.now()&&this.options.canRead(sessionId)}
  async execute(value:any,signal?:AbortSignal):Promise<unknown> {
    if(value?.guardId!==undefined&&(!validId(value.guardId)||value.source!=='component-data-refresh'||!['inspect','apply'].includes(value.method)))throw Error('画板操作内部校验标识无效。')
    const binding=this.bindings.get(value?.sessionId)
    if(this.stopped||!binding||binding.expires<Date.now()||!this.options.canRead(value.sessionId)||!['inspect','apply','undo','use'].includes(value.method)||this.pending.size>=20)throw Error('当前执行未绑定可访问的画板，请从画板右侧重新发送指令。')
    signal?.throwIfAborted()
    const requestId=randomUUID()
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.get(requestId)?.cleanup();this.pending.delete(requestId);try{this.options.send({requestId,cancel:true})}catch{}reject(Error('画布操作响应超时。请先查看当前状态；重试变更须沿用原 requestId。'))},40000)
      const abort=()=>{clearTimeout(timer);this.pending.delete(requestId);try{this.options.send({requestId,cancel:true})}catch{}reject(Error('画布操作已取消。'));signal?.removeEventListener('abort',abort)}
      const cleanup=()=>signal?.removeEventListener('abort',abort)
      signal?.addEventListener('abort',abort,{once:true})
      this.pending.set(requestId,{sessionId:value.sessionId,resolve,reject,timer,cleanup})
      try{this.options.send({requestId,sessionId:value.sessionId,method:value.method,args:value.args,scheduled:value.scheduled===true,...(value.source==='component-data-refresh'?{source:'component-data-refresh'}:{}),...(value.guardId!==undefined?{guardId:value.guardId}:{}),selectedIds:binding.selectedIds,expiresAt:Date.now()+35000})}catch{clearTimeout(timer);cleanup();this.pending.delete(requestId);reject(Error('画板窗口不可用。'))}
    })
  }
  respond(value:any):void {
    const pending=this.pending.get(value?.requestId)
    if(!pending||pending.sessionId!==value.sessionId)return
    clearTimeout(pending.timer);this.pending.delete(value.requestId);pending.cleanup()
    if(typeof value.error==='string')pending.reject(Error(value.error.slice(0,600)))
    else pending.resolve(value.result)
  }
  dispose():void {this.stopped=true;this.bindings.clear();for(const p of this.pending.values()){clearTimeout(p.timer);p.cleanup();p.reject(Error('画布服务已停止。'))}this.pending.clear()}
}
export function registerCanvasActionHandlers(options:{ipcMain:{removeHandler(channel:string):void;handle(channel:string,handler:(event:TrustedWindowEvent,value:any)=>unknown):unknown};getMainWindow():TrustedWindow|undefined;bridge:CanvasActionBridge}):()=>void {
  const channels=['research:canvas-actions:bind','research:canvas-actions:reply']
  for(const channel of channels){options.ipcMain.removeHandler(channel);registerTrustedMainWindowHandler(options.ipcMain,channel,options.getMainWindow,(_event,value:any)=>channel.endsWith(':bind')?options.bridge.bind(value):options.bridge.respond(value))}
  return ()=>{for(const channel of channels)options.ipcMain.removeHandler(channel);options.bridge.dispose()}
}
