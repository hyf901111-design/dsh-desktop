import { assertTrustedMainWindowEvent, type TrustedWindow, type TrustedWindowEvent } from '../ipc-trust'
const commands=new Set(['rebuild-index','snapshot','save','action','settings','project','bind','session','source','legacy-preview','import-legacy'])
export function registerMemoryIpc(ipc:{handle(name:string,fn:(event:TrustedWindowEvent,command:any)=>Promise<unknown>):unknown},window:()=>TrustedWindow|undefined,service:{request(command:any):Promise<unknown>}) {
  ipc.handle('memory:request',async(event,command)=>{
    assertTrustedMainWindowEvent(event,window())
    if(!command||typeof command!=='object'||Array.isArray(command)||!commands.has(command.type))throw Error('未知记忆操作。')
    if(JSON.stringify(command).length>128000)throw Error('记忆操作内容过大，请精简后重试。')
    return service.request(command)
  })
}
