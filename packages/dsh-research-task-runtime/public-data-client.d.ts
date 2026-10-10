export const PUBLIC_DATA_CONNECTION: 'builtin:public-data'
export const PUBLIC_DATA_SCHEMA: 'builtin-public-data-v1'
export function createPublicDataClient(options?:{root?:string;moduleLoader?:()=>Promise<any>}):{
 validate:(args:Record<string,unknown>)=>Promise<{sourceId:string;sourceName:string}>
 query:(args:Record<string,unknown>,signal?:AbortSignal)=>Promise<any>
}
