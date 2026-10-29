import {deflateRawSync,inflateRawSync} from 'node:zlib'

// Build-time restore data is opaque to later source anchor passes. Keep older
// JSON-array records readable without shipping their verbatim code twice.
export function serializeWorkbenchRestore(changes) {
 return JSON.stringify({version:1,encoding:'deflate-base64',data:deflateRawSync(Buffer.from(JSON.stringify(changes),'utf8')).toString('base64')})
}
export function parseWorkbenchRestore(value) {
 const record=JSON.parse(value)
 const changes=Array.isArray(record)?record:record?.version===1&&record.encoding==='deflate-base64'&&typeof record.data==='string'
  ?JSON.parse(inflateRawSync(Buffer.from(record.data,'base64'),{maxOutputLength:64*1024*1024}).toString('utf8')):null
 if(!Array.isArray(changes)||changes.some(row=>!Array.isArray(row)||row.length<2||row.length>3||typeof row[0]!=='string'||typeof row[1]!=='string'||row.length===3&&(!Number.isSafeInteger(row[2])||row[2]<1)))throw Error('Workbench restore record is invalid')
 return changes
}
