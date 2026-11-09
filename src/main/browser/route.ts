/** Explicit current-page references never fall through into a legacy session browser. */
export function routeBrowserUse(input:unknown,signal:AbortSignal,app:{ownsSession(id:unknown):boolean;agent(input:unknown,signal:AbortSignal):Promise<unknown>},legacy:(input:unknown,signal:AbortSignal)=>Promise<unknown>){
 const request=input as {sessionId?:unknown;op?:unknown;tabId?:unknown};
 return app.ownsSession(request?.sessionId)||['edit','undo'].includes(String(request?.op))||request?.tabId!==undefined?app.agent(input,signal):legacy(input,signal)
}
