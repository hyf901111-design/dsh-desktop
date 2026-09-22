import {createHash,createPrivateKey,sign} from 'node:crypto'
import bundled from '../../build/integration-catalog/catalog.json'
import {canonicalManifestJson,compareVersions,manifestDigest,validateManifest} from '../../src/main/integrations/manifest.ts'
import {BrokerError} from './oauth-broker.js'

const kinds=new Set(['plugin','app','tool','skill'])
const validId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value)
const isRecord=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)
const hash=value=>createHash('sha256').update(value).digest('hex')
const invalid=()=>{throw new BrokerError('INVALID_CATALOG_QUERY',400)}
const MAX_ENTRY_BYTES=256*1024,MAX_PAGE_ENTRIES=20
const responseHeaders={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60, must-revalidate','x-content-type-options':'nosniff','access-control-allow-origin':'*','access-control-expose-headers':'ETag'}

/** Same manifest validator and canonical digest as the desktop installer; no operator-only fields leave this projection. */
export function validateCatalogEntry(input){
  if(!isRecord(input)||Buffer.byteLength(JSON.stringify(input))>MAX_ENTRY_BYTES||!validId(input.id)||!kinds.has(input.kind))throw Error('Invalid catalog entry')
  for(const field of ['name','description','publisher','version'])if(typeof input[field]!=='string'||!input[field].trim()||input[field].length>2000)throw Error('Invalid catalog metadata')
  compareVersions(input.version,input.version)
  if(input.minClientVersion!==undefined)compareVersions(input.minClientVersion,input.minClientVersion)
  if(!Array.isArray(input.permissions)||input.permissions.length>100||input.permissions.some(value=>typeof value!=='string'||value.length>1000)||!isRecord(input.manifest))throw Error('Invalid catalog permissions or manifest')
  if(input.kind==='plugin'||input.kind==='skill'){
    const manifest=validateManifest(input.manifest)
    if(manifest.version!==input.version||input.digest!==manifestDigest(input.manifest))throw Error('Invalid manifest digest or version')
  }else{
    const allowed=input.kind==='app'?['notion','google-calendar']:['api','mcp-http','mcp-stdio']
    if(!allowed.includes(input.manifest.type))throw Error('Unsupported connection type')
    for(const[key,value]of Object.entries(input.manifest))if(!['type','name','url','clientId','command','args','cwd','authType','headerName','toolsJson'].includes(key)||typeof value!=='string')throw Error('Invalid connection blueprint')
  }
  return{id:input.id,kind:input.kind,name:input.name,description:input.description,publisher:input.publisher,version:input.version,permissions:[...input.permissions],manifest:structuredClone(input.manifest),...(input.minClientVersion?{minClientVersion:input.minClientVersion}:{}),...(typeof input.digest==='string'?{digest:input.digest}:{})}
}

function parameters(url){
  for(const key of url.searchParams.keys())if(!['kind','query','cursor','limit'].includes(key)||url.searchParams.getAll(key).length!==1)invalid()
  const kind=url.searchParams.get('kind')??'',query=(url.searchParams.get('query')??'').trim(),rawLimit=url.searchParams.get('limit')??String(MAX_PAGE_ENTRIES)
  if(kind&&!kinds.has(kind)||query.length>200||/[\u0000-\u001f]/u.test(query)||!/^\d+$/.test(rawLimit))invalid()
  const limit=Number(rawLimit);if(limit<1||limit>MAX_PAGE_ENTRIES)invalid()
  let cursor
  const encoded=url.searchParams.get('cursor')
  if(encoded!==null){
    try{if(encoded.length>2048||!/^[A-Za-z0-9_-]+$/.test(encoded))invalid();cursor=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}catch{invalid()}
    if(!isRecord(cursor)||cursor.v!==1||cursor.kind!==kind||cursor.query!==query||cursor.limit!==limit||!validId(cursor.after)||typeof cursor.revision!=='string'||cursor.revision.length>100)invalid()
  }
  return{kind,query,limit,cursor}
}

async function catalogPage(env,filters){
  const db=env.CATALOG_DB??env.INTEGRATIONS_DB
  if(!db){
    const revision=hash(canonicalManifestJson(bundled))
    if(filters.cursor&&filters.cursor.revision!==revision)throw new BrokerError('CATALOG_CHANGED',409)
    const selected=bundled.entries.filter(entry=>(!filters.kind||entry.kind===filters.kind)&&(!filters.query||`${entry.name} ${entry.description}`.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase()))&&(!filters.cursor||entry.id>filters.cursor.after)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,filters.limit+1)
    return{revision,entries:selected.map(validateCatalogEntry)}
  }
  const revision=String((await db.prepare('SELECT revision FROM integration_catalog_revision WHERE singleton=1').first())?.revision)
  if(!/^\d+$/.test(revision))throw Error('Catalog migration missing')
  if(filters.cursor&&filters.cursor.revision!==revision)throw new BrokerError('CATALOG_CHANGED',409)
  const conditions=["status='published'"],values=[]
  if(filters.kind){conditions.push('kind=?');values.push(filters.kind)}
  if(filters.query){conditions.push("lower(json_extract(entry_json,'$.name') || ' ' || json_extract(entry_json,'$.description')) LIKE ? ESCAPE '\\'");values.push(`%${filters.query.toLocaleLowerCase().replace(/[\\%_]/g,'\\$&')}%`)}
  if(filters.cursor){conditions.push('id>?');values.push(filters.cursor.after)}
  values.push(filters.limit+1)
  const rows=await db.prepare(`SELECT entry_json FROM integration_catalog_entries WHERE ${conditions.join(' AND ')} ORDER BY id LIMIT ?`).bind(...values).all()
  const current=String((await db.prepare('SELECT revision FROM integration_catalog_revision WHERE singleton=1').first())?.revision)
  if(current!==revision)throw new BrokerError('CATALOG_CHANGED',409)
  return{revision,entries:rows.results.map(row=>validateCatalogEntry(JSON.parse(row.entry_json)))}
}

export async function handleCatalogRequest(request,env){
  if(request.method!=='GET')return Response.json({error:{code:'METHOD_NOT_ALLOWED'}},{status:405,headers:{...responseHeaders,allow:'GET','cache-control':'no-store'}})
  try{
    const filters=parameters(new URL(request.url)),page=await catalogPage(env,filters),hasMore=page.entries.length>filters.limit
    const entries=page.entries.slice(0,filters.limit)
    const nextCursor=hasMore?Buffer.from(JSON.stringify({v:1,kind:filters.kind,query:filters.query,limit:filters.limit,after:entries.at(-1).id,revision:page.revision})).toString('base64url'):null
    const document={schemaVersion:1,entries,nextCursor,catalogRevision:page.revision}
    if(env.CATALOG_SIGNING_PRIVATE_KEY){
      const key=createPrivateKey(env.CATALOG_SIGNING_PRIVATE_KEY)
      if(key.asymmetricKeyType!=='ed25519')throw Error('Invalid signing key')
      document.signature=sign(null,Buffer.from(canonicalManifestJson({schemaVersion:1,entries})),key).toString('base64')
    }
    const content=JSON.stringify(document)
    if(Buffer.byteLength(content)>8*1024*1024)throw Error('Catalog response too large')
    const etag=`"${hash(content)}"`,headers={...responseHeaders,etag}
    const validators=(request.headers.get('if-none-match')??'').split(',').map(value=>value.trim().replace(/^W\//,''))
    if(validators.includes(etag)||validators.includes('*'))return new Response(null,{status:304,headers})
    return new Response(content,{headers})
  }catch(error){return Response.json({error:{code:error instanceof BrokerError?error.code:'CATALOG_UNAVAILABLE'}},{status:error instanceof BrokerError?error.status:503,headers:{...responseHeaders,'cache-control':'no-store'}})}
}
