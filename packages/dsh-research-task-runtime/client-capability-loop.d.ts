import type {CapabilityCall,CapabilityReceipt} from './client-capabilities.js'
export function runClientCapabilityLoop(options:{generate(receipts:CapabilityReceipt[]):Promise<any>;execute(call:CapabilityCall):Promise<CapabilityReceipt>;signal?:AbortSignal;preserveRemainingReply?:boolean;onReceipts?(receipts:CapabilityReceipt[]):void}):Promise<any>
