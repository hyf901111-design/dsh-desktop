import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { freeDataDirectory } from './free-data-skill.js'

export const PUBLIC_DATA_CONNECTION = 'builtin:public-data'
export const PUBLIC_DATA_SCHEMA = 'builtin-public-data-v1'

// Share only fixed bundled adapters, keeping agent runtime and credentials out
// of the desktop import graph.
export function createPublicDataClient({root,moduleLoader}={}) {
 let loaded
 const load=()=>loaded??=(moduleLoader?moduleLoader():import(pathToFileURL(join(freeDataDirectory(root),'scripts/query.mjs')).href))
 async function validated(args) {
  if(!args||args.operation!=='query'||Object.keys(args).some(k=>!['operation','source','parameters_json'].includes(k))||typeof args.source!=='string'||args.source.length>64||typeof(args.parameters_json??'{}')!=='string'||(args.parameters_json?.length??0)>5000)throw Error('免费数据源刷新参数无效')
  let parameters
  try{parameters=JSON.parse(args.parameters_json??'{}')}catch{throw Error('parameters_json必须为有效JSON对象')}
  const api=await load(),request=api.prepareRequest(args.source,parameters)
  return {api,parameters,source:request.source}
 }
 return {
  validate:async args=>{const {source}=await validated(args);return {sourceId:source.id,sourceName:source.name}},
  query:async(args,signal)=>{signal?.throwIfAborted();const {api,parameters}=await validated(args);return api.queryClient.query({source:args.source,parameters},signal)}
 }
}
