/** Parse only a whole private envelope. Markdown and code are never scanned. */
export function parseNotePublicOutput(text,{hasReceipts=false,recovery=false,wireToken}={}){
 if(typeof text!=='string'||text.length>100000)return
 const value=text.trim();if(!value)return
 const known=['text','conversation','component','capabilities'],fields=['markdown','text','content']
 const envelope=item=>item&&typeof item==='object'&&!Array.isArray(item)&&(known.includes(item.kind)||Object.keys(item).length===1&&fields.includes(Object.keys(item)[0]))
 // A whole JSON fence can be either a wrapped private reply or the JSON/code
 // the user asked for. Let the single recovery round use the original intent.
 const fence=/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/iu.exec(value)
 if(fence){let inner;try{inner=JSON.parse(fence[1])}catch{}if(envelope(inner)){if(!recovery&&typeof wireToken==='string'&&inner.wireToken===wireToken&&['component','capabilities'].includes(inner.kind))return parseNotePublicOutput(fence[1],{hasReceipts,recovery,wireToken});return;}if(hasReceipts||recovery)return;return{kind:'text',markdown:value}}
 let item
 try{item=JSON.parse(value)}catch{if(/^(?:\{\s*"(?:kind|markdown|text|content|calls|artifact)"|\[\s*\{\s*"kind")/u.test(value))return}
 if(Array.isArray(item)&&item.some(value=>envelope(value)||value&&typeof value==='object'&&['calls','operations','tool_calls','capability','artifact'].some(key=>Object.hasOwn(value,key))))return
 if(item&&typeof item==='object'&&!Array.isArray(item)){
  const keys=Object.keys(item)
  if(!keys.length||keys.length===1&&['message','reply','summary'].includes(keys[0]))return
  if(envelope(item)&&item.kind===undefined)return
  if(typeof item.kind==='string'){
   if(['component','capabilities'].includes(item.kind)){if(keys.some(key=>!['kind','wireToken',...item.kind==='component'?['artifact','targetBlockId']:['calls']].includes(key)))return;return item}
   if(!['text','conversation'].includes(item.kind)||keys.some(key=>!['kind','markdown','text','content',...recovery?['replyRole']:[]].includes(key)))return
  }else if(!envelope(item)){
   if(['calls','operations','tool_calls','capability','artifact','targetBlockId'].some(key=>Object.hasOwn(item,key)))return
   if(hasReceipts||recovery)return
   return{kind:'text',markdown:value}
  }
  if(['calls','artifact','targetBlockId'].some(key=>Object.hasOwn(item,key)))return
  if(Object.hasOwn(item,'markdown')&&typeof item.markdown!=='string')return
  const strings=[...new Set(fields.filter(key=>Object.hasOwn(item,key)).map(key=>item[key]))]
  if(strings.length!==1||typeof strings[0]!=='string')return
  return{kind:item.kind||'text',markdown:strings[0].trim(),...recovery&&['remaining','receipts'].includes(item.replyRole)?{replyRole:item.replyRole}:{}}
 }
 if(hasReceipts||recovery)return
 return{kind:'text',markdown:value}
}
