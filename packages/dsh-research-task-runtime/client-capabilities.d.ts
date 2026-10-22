export type ClientCapabilityContext={owner:string;sessionId:string;documentId:string;mode:'notes'|'research'|'conversation';editable:boolean;selectedBlockIds:string[];componentBlockIds?:string[]}
export type ClientCapabilityArguments={
 'notes.components.create':{prompt:string}
 'notes.export':{format:'pdf'|'docx'|'md';path?:string}
 'notes.components.style':{scope:'note'|'selected';theme?:'light'|'dark'|'enterprise'|'openterminal'|'auto';titleBar?:boolean}
 'canvas.inspect':Record<string,never>
 'ui.zoom.reset':Record<string,never>
}
export type ClientCapabilityId=keyof ClientCapabilityArguments
export type CapabilityCall={[K in ClientCapabilityId]:{requestId:string;capability:K;arguments:ClientCapabilityArguments[K]}}[ClientCapabilityId]
export type CapabilityReceipt={requestId?:string;capability?:string;status:'succeeded'|'pending'|'cancelled'|'failed'|'unavailable';message?:string;path?:string;changedBlockIds?:string[];blockId?:string;data?:unknown}
export type CapabilityHandler<K extends ClientCapabilityId=ClientCapabilityId>=(args:ClientCapabilityArguments[K],context:ClientCapabilityContext,signal?:AbortSignal,requestId?:string)=>Promise<CapabilityReceipt>
export function createClientCapabilityRegistry(handlers:{createComponent?:CapabilityHandler<'notes.components.create'>;exportNote?:CapabilityHandler<'notes.export'>;styleComponents?:CapabilityHandler<'notes.components.style'>;inspectCanvas?:CapabilityHandler<'canvas.inspect'>;resetZoom?:CapabilityHandler<'ui.zoom.reset'>}):{catalog(context:ClientCapabilityContext):Array<{id:string;description:string;parameters:any;available:boolean}>;get(id:string):any;execute(call:CapabilityCall,context:ClientCapabilityContext,signal?:AbortSignal):Promise<CapabilityReceipt>}
export function createCapabilityExecutor(registry:ReturnType<typeof createClientCapabilityRegistry>,current:()=>ClientCapabilityContext|undefined):{execute(call:CapabilityCall,context:ClientCapabilityContext,signal?:AbortSignal):Promise<CapabilityReceipt>}
export function capabilityReceiptText(receipts:CapabilityReceipt[]):string
