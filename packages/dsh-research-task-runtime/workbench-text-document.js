import {extname} from 'node:path'

const textFormats=new Set(['.md','.markdown','.txt'])
export const isWorkbenchTextPath=path=>textFormats.has(extname(path).toLowerCase())
export const isWorkbenchDocumentPath=path=>isWorkbenchTextPath(path)||/\.(?:pdf|docx|csv|tsv)$/iu.test(path)

// Retain real paragraphs, Markdown tables and line breaks as source text. P labels
// identify these exact blocks for citations; markup and links are never executed.
export function extractWorkbenchTextDocument(bytes,name,budget){
 const clipped=bytes.length>budget
 const input=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,budget),{stream:clipped}).replace(/\r\n?/gu,'\n').trim()
 if(!input||input.includes('\0'))throw Error('文本文档没有可读取的 UTF-8 正文。')
 const document={name,format:/\.txt$/iu.test(name)?'text':'markdown',blocks:[],truncated:false}
 let remaining=budget-Buffer.byteLength(JSON.stringify(document))
 for(const paragraph of input.split(/\n[^\S\n]*\n+/u)){
  const id='P'+(document.blocks.length+1)
  let text=paragraph
  const cost=value=>Buffer.byteLength(JSON.stringify({id,text:value}))+1
  if(cost(text)>remaining){
   document.truncated=true
   // One long paragraph can exceed the whole budget. Keep its readable prefix
   // without cutting a code point or counting JSON escapes as source bytes.
   let used=cost(''),prefix=''
   for(const character of text){
    used+=Buffer.byteLength(JSON.stringify(character))-2
    if(used>remaining)break
    prefix+=character
   }
   text=prefix
  }
  if(text){document.blocks.push({id,text});remaining-=cost(text)}
  if(document.truncated)break
 }
 document.truncated ||= clipped
 if(!document.blocks.length)throw Error('文本文档超出读取容量。')
 return document
}
