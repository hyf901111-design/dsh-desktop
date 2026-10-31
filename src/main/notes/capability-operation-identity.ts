import {createCapabilityExecutor,type ClientCapabilityContext} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import type {createClientCapabilityHost} from '../../../packages/dsh-research-task-runtime/client-capability-host.js'

/** A provider may use one local call ID for read then apply. A Notes generation
 * owns one stable executor per semantic capability; each still fingerprints
 * the original context, ID and arguments. Never key by arguments or retry with
 * a random ID: changed payloads must continue to fail and writes replay once.
 * Raw call IDs stay intact for receipts and mixed-content placement. */
export function createNoteCapabilityExecutor(host:ReturnType<typeof createClientCapabilityHost>,current:()=>ClientCapabilityContext|undefined):ReturnType<typeof createCapabilityExecutor>{
 const operations=new Map<string,ReturnType<typeof createCapabilityExecutor>>()
 return{execute(call,context,signal){
  const capability=call?.capability
  if(context?.mode!=='notes'||typeof capability!=='string'||!capability.startsWith('notes.')||!host.registry.get(capability))return host.executor.execute(call,context,signal)
  let executor=operations.get(capability)
  if(!executor){executor=createCapabilityExecutor(host.registry,current);operations.set(capability,executor)}
  return executor.execute(call,context,signal)
 }}
}
