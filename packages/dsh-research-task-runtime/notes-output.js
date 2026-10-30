const wholeJsonFence=/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/iu
const currentTransport=(item,wireToken)=>typeof wireToken==='string'&&wireToken.length>0&&item&&typeof item==='object'&&!Array.isArray(item)&&item.wireToken===wireToken
const combinedEnvelope=item=>item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).every(key=>['wireToken','text','capabilities'].includes(key))&&(item.text===undefined||['text','conversation'].includes(item.text?.kind))&&item.capabilities?.kind==='capabilities'

/** Inspect only the whole output, never JSON embedded in prose or Markdown. */
export function currentNoteTransport(text,wireToken){
 if(typeof text!=='string'||text.length>100000)return
 const value=text.trim(),fence=wholeJsonFence.exec(value)
 try{const item=JSON.parse(fence?fence[1]:value);return currentTransport(item,wireToken)?item:undefined}catch{}
}

/** Close only EOF containers after an already complete final container value.
 * This is syntax recovery, never operation authority: callers still validate
 * the current nonce, whole envelope, catalog, arguments and source intent. */
export function completeNoteJsonContainers(text){
 if(typeof text!=='string'||text.length>100000)return
 const value=text.trim();if(value[0]!=='{'||!/[}\]]$/u.test(value))return
 const closers=[];let quoted=false,escaped=false
 for(let index=0;index<value.length;index++){
  const char=value[index]
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue}
  if(char==='"')quoted=true
  else if(char==='{'||char==='['){closers.push(char==='{'?'}':']');if(closers.length>64)return}
  else if(char==='}'||char===']'){if(closers.pop()!==char||!closers.length&&index!==value.length-1)return}
 }
 if(quoted||escaped||!closers.length)return
 const completed=value+closers.reverse().join('')
 try{return{text:completed,value:JSON.parse(completed)}}catch{}
}

/** Check the whole content-only result, never JSON examples embedded in prose. */
export function noteNonContentEnvelope(text){
 if(typeof text!=='string'||text.length>100000)return false
 const value=text.trim(),fence=wholeJsonFence.exec(value)
 try{
  const item=JSON.parse(fence?fence[1]:value)
  if(!item||typeof item!=='object'||Array.isArray(item))return false
  const keys=Object.keys(item),error=typeof item.error==='string'||item.error&&typeof item.error==='object'
  return ['capabilities','component'].includes(item.kind)||item.capabilities?.kind==='capabilities'||Array.isArray(item.calls)&&item.calls.some(call=>typeof call?.capability==='string')||!!error&&keys.every(key=>['error','message','code','status','type','param'].includes(key))
 }catch{return false}
}

/** Parse only a whole private envelope. Markdown and code are never scanned. */
export function parseNotePublicOutput(text,{hasReceipts=false,recovery=false,wireToken,displayCode=false}={}){
 if(typeof text!=='string'||text.length>100000)return
 const value=text.trim();if(!value)return
 const known=['text','conversation','component','capabilities'],fields=['markdown','text','content']
 const envelope=item=>item&&typeof item==='object'&&!Array.isArray(item)&&(known.includes(item.kind)||combinedEnvelope(item)||item.capabilities?.kind==='capabilities'||Object.keys(item).length===1&&fields.includes(Object.keys(item)[0]))
 // A whole JSON fence can be either a wrapped private reply or the JSON/code
 // the user asked for. Let the single recovery round use the original intent.
 const fence=wholeJsonFence.exec(value)
 if(fence){let inner;try{inner=JSON.parse(fence[1])}catch{}if(envelope(inner)||currentTransport(inner,wireToken)){if(!recovery&&currentTransport(inner,wireToken)&&['component','capabilities'].includes(inner.kind))return parseNotePublicOutput(fence[1],{hasReceipts,recovery,wireToken});return;}if(hasReceipts||recovery)return;return{kind:'text',markdown:value}}
 let item
 try{item=JSON.parse(value)}catch{if(/^(?:\{\s*"(?:kind|markdown|text|content|calls|artifact)"|\[\s*\{\s*"kind")/u.test(value))return}
 if(Array.isArray(item)&&item.some(value=>envelope(value)||currentTransport(value,wireToken)||value&&typeof value==='object'&&['calls','operations','tool_calls','capability','artifact'].some(key=>Object.hasOwn(value,key))))return
 if(item&&typeof item==='object'&&!Array.isArray(item)){
  // A matching host nonce identifies transport even when its outer union tag
  // is missing or combines several replies. It can never take literal fallback.
  if(currentTransport(item,wireToken)&&!['component','capabilities'].includes(item.kind))return
  const keys=Object.keys(item)
  // A whole text-only document wrapper has no operation authority. Preserve
  // its complete body instead of asking the model to rewrite good prose.
  if(['document','markdown'].includes(item.kind)&&keys.length===2){const key=keys.find(key=>['body',...fields].includes(key));if(key&&typeof item[key]==='string')return{kind:'text',markdown:displayCode?value:item[key].trim()}}
  if(!keys.length||keys.length===1&&['message','reply','summary'].includes(keys[0]))return
  if(envelope(item)&&item.kind===undefined)return
  if(typeof item.kind==='string'){
   if(['component','capabilities'].includes(item.kind)){if(keys.some(key=>!['kind','wireToken',...item.kind==='component'?['artifact','targetBlockId']:['calls','inlineOrder']].includes(key))||item.inlineOrder!==undefined&&!['before-components','after-components'].includes(item.inlineOrder))return;return item}
   if(!['text','conversation'].includes(item.kind)||keys.some(key=>!['kind','markdown','text','content',...item.kind==='text'?['inlineOrder']:[],...recovery?['replyRole']:[]].includes(key)))return
  }else if(!envelope(item)){
   if(['calls','operations','tool_calls','capability','artifact','targetBlockId'].some(key=>Object.hasOwn(item,key)))return
   if(hasReceipts||recovery)return
   return{kind:'text',markdown:value}
  }
  if(['calls','artifact','targetBlockId'].some(key=>Object.hasOwn(item,key)))return
  if(Object.hasOwn(item,'markdown')&&typeof item.markdown!=='string')return
  if(Object.hasOwn(item,'inlineOrder')&&!['before-components','after-components'].includes(item.inlineOrder))return
  const strings=[...new Set(fields.filter(key=>Object.hasOwn(item,key)).map(key=>item[key]))]
  if(strings.length!==1||typeof strings[0]!=='string')return
  return{kind:item.kind||'text',markdown:strings[0].trim(),...item.inlineOrder?{inlineOrder:item.inlineOrder}:{},...recovery&&['remaining','receipts'].includes(item.replyRole)?{replyRole:item.replyRole}:{}}
 }
 if(hasReceipts||recovery)return
 return{kind:'text',markdown:value}
}
