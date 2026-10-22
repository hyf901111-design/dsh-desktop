export type ClientCapabilityContext={owner:string;sessionId:string;documentId:string;mode:'notes'|'research'|'conversation';editable:boolean;selectedBlockIds:string[];componentBlockIds?:string[];selectedParagraphIds?:string[]}
export type ClientCapabilityArguments={
 'notes.components.create':{prompt:string}
 'notes.export':{format:'pdf'|'docx'|'md';path?:string}
 'notes.components.style':{scope:'note'|'selected';theme?:'light'|'dark'|'enterprise'|'openterminal'|'auto';titleBar?:boolean}
 'notes.blocks.align':{scope:'note'|'selected';target:'paragraphs'|'researchComponents';alignment:'left'|'center'|'right'}
 'notes.components.inspect':Record<string,never>
 'notes.components.apply':{blockId:string;revision:string;containerSpec:Record<string,any>}
 'canvas.inspect':Record<string,never>
 'ui.zoom.reset':Record<string,never>
}
export type ClientCapabilityId=keyof ClientCapabilityArguments
export type CapabilityCall={[K in ClientCapabilityId]:{requestId:string;capability:K;arguments:ClientCapabilityArguments[K]}}[ClientCapabilityId]
export type CapabilityStyleEffect={state:'applied'|'saved';changedBlockIds:string[];kind?:'alignment'|'content'}
export type CapabilityExportEffect={state:'writing'|'saved';path:string}
export type CapabilityCreateEffect={state:'placeholder'|'applied'|'saved';blockId:string}
export type CapabilityEffect=CapabilityStyleEffect|CapabilityExportEffect|CapabilityCreateEffect
export type CapabilityReceipt={requestId?:string;capability?:string;status:'succeeded'|'pending'|'cancelled'|'failed'|'unavailable';message?:string;effect?:CapabilityEffect;path?:string;changedBlockIds?:string[];blockId?:string;data?:unknown}
export type CapabilityHandler<K extends ClientCapabilityId=ClientCapabilityId>=(args:ClientCapabilityArguments[K],context:ClientCapabilityContext,signal?:AbortSignal,requestId?:string)=>Promise<CapabilityReceipt>
export function createClientCapabilityRegistry(handlers:{createComponent?:CapabilityHandler<'notes.components.create'>;exportNote?:CapabilityHandler<'notes.export'>;styleComponents?:CapabilityHandler<'notes.components.style'>;alignBlocks?:CapabilityHandler<'notes.blocks.align'>;inspectNoteComponent?:CapabilityHandler<'notes.components.inspect'>;applyNoteComponent?:CapabilityHandler<'notes.components.apply'>;inspectCanvas?:CapabilityHandler<'canvas.inspect'>;resetZoom?:CapabilityHandler<'ui.zoom.reset'>}):{catalog(context:ClientCapabilityContext):Array<{id:string;description:string;parameters:any;available:boolean}>;get(id:string):any;execute(call:CapabilityCall,context:ClientCapabilityContext,signal?:AbortSignal):Promise<CapabilityReceipt>}
export function createCapabilityExecutor(registry:ReturnType<typeof createClientCapabilityRegistry>,current:()=>ClientCapabilityContext|undefined):{execute(call:CapabilityCall,context:ClientCapabilityContext,signal?:AbortSignal):Promise<CapabilityReceipt>}
export function noteCapabilityReceiptMessage(receipt:CapabilityReceipt,locale?:string):string|undefined
export function capabilityReceiptText(receipts:CapabilityReceipt[],locale?:string):string
