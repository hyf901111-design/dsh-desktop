import {readFileSync} from 'node:fs'
import {parse} from '@babel/parser'
const frozen=JSON.parse(readFileSync(new URL('./task-resume-client-v3.json',import.meta.url),'utf8')).declarations
/** Restore only frozen pre-footer UI declarations, never mutate the installed SDK. */
export function legacyTaskResumeClient(source) {
 const replacements=[]
 const visit=node=>{
  if(!node||typeof node!=='object')return
  if(node.type==='FunctionDeclaration'&&frozen[node.id?.name])replacements.push({start:node.start,end:node.end,text:frozen[node.id.name]})
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)
 }
 visit(parse(source,{sourceType:'script'}))
 if(replacements.length!==3)throw Error('Frozen task resume fixture declaration drifted')
 for(const item of replacements.sort((a,b)=>b.start-a.start))source=source.slice(0,item.start)+item.text+source.slice(item.end)
 return source
}
