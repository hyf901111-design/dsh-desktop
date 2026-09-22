import type {AdapterResult,Connection,JsonSchema} from '../../../shared/integrations'
export type ProviderTool={name:string;description:string;inputSchema:JsonSchema;effect:'read'|'write'|'destructive'|'unknown'}
export interface ProviderAdapter {
  describeCapabilities(connection:Connection):ProviderTool[]
  probe(connection:Connection,signal:AbortSignal):Promise<{accountLabel?:string}>
  invoke(connection:Connection,operationId:string,args:Record<string,unknown>,signal:AbortSignal):Promise<AdapterResult>
  authorize?(connection:Connection,signal:AbortSignal):Promise<{credential:string;accountLabel?:string}>
  disconnect?(connection:Connection,signal:AbortSignal):Promise<void>
}
