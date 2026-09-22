import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
const root=resolve(process.argv[2] || 'build/integration-catalog')
const catalog=JSON.parse(await readFile(resolve(root,'catalog.json'),'utf8'))
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
if(catalog.schemaVersion!==1||!Array.isArray(catalog.entries))throw new Error('Invalid catalog schema')
const ids=new Set(),kinds=new Set()
for(const entry of catalog.entries){
 if(ids.has(entry.id))throw new Error(`Duplicate entry: ${entry.id}`);ids.add(entry.id);kinds.add(entry.kind)
 if(['plugin','skill'].includes(entry.kind)){
  const digest=createHash('sha256').update(canonical(entry.manifest)).digest('hex')
  if(digest!==entry.digest)throw new Error(`Digest mismatch: ${entry.id}`)
  for(const skill of entry.manifest.skills){if(!/^[a-z0-9._-]+$/.test(skill.id))throw new Error('Unsafe skill id');const source=await readFile(resolve(root,'skills',skill.id,'SKILL.md'),'utf8');if(source!==skill.files['SKILL.md'])throw new Error(`Resource mismatch: ${entry.id}/${skill.id}`)}
 }else if(!entry.manifest?.type)throw new Error(`No connection blueprint: ${entry.id}`)
}
for(const kind of ['plugin','app','tool','skill'])if(!kinds.has(kind))throw new Error(`Missing catalog: ${kind}`)
console.log(`Validated ${catalog.entries.length} catalog entries and bundled skill resources`)
