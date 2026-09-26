export type DataValue = null | boolean | number | string | DataValue[] | {[key:string]:DataValue}
export type DataRequest = {key:string;toolId:string;args:Record<string,DataValue>;connectionId:string;connectionRevision:number;schemaDigest:string;sourceName?:string}
export type ComponentDataBinding = {
 id:string;revision:number;ownerAccountId:string;sessionId:string;nodeId:string;workspaceId:string;templateId:string;templateVersion:string;
 requests:DataRequest[];mapping:Record<string,DataValue>;intervalMinutes:number;enabled:boolean;
 status:'idle'|'paused'|'refreshing'|'success'|'unchanged'|'error';failures:number;nextRun:number|null;lastAttempt?:number;lastSuccess?:number;dataAsOf?:string;error?:string
}
export type ComponentDataInput = Pick<ComponentDataBinding,'sessionId'|'nodeId'|'workspaceId'|'mapping'|'intervalMinutes'> & {requests:Array<Pick<DataRequest,'key'|'toolId'|'args'>>}
export type ComponentDataSettings = {enabled?:boolean;intervalMinutes?:number;deleted?:boolean}
