import {parseDocument} from 'yaml'

/** Presentation only. Runtime lookup continues to use the stable installed ID. */
export function skillEnglishName(content:string,id:string,fallback:string):string {
 let name:unknown
 const header=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
 if(header)try{
  const document=parseDocument(header[1]!,{schema:'core',uniqueKeys:true})
  if(!document.errors.length&&!document.warnings.length)name=document.toJS({maxAliasCount:20})?.name
 }catch{/* Display falls back without relaxing trusted resource validation. */}
 for(const candidate of [name,id.startsWith('builtin:')?id.slice(8):fallback]){
  if(typeof candidate!=='string')continue
  const slug=candidate.trim().toLowerCase().replace(/[\s_]+/g,'-')
  if(/^[a-z][a-z0-9-]{0,99}$/.test(slug))return slug
 }
 return 'custom-skill'
}
