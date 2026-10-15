import {createFrozenResearchFileLoader} from './context-runtime.js'
import {selectedResearchExcerpt} from './context-index.js'

/** Same private capture channel and frozen file extractor as research mode. */
async function capturedSources(sessionId,captureId,{env=process.env,fetch:request=globalThis.fetch}={},signal){
 const url=new URL(env.SHERLOCK_RESEARCH_CONTEXT_URL)
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!env.SHERLOCK_RESEARCH_CONTEXT_TOKEN)throw Error('笔记资料服务不可用。')
 const active=AbortSignal.any([signal,AbortSignal.timeout(15000)])
 const response=await request(`${url.origin}/snapshot`,{method:'POST',redirect:'error',signal:active,headers:{authorization:`Bearer ${env.SHERLOCK_RESEARCH_CONTEXT_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({sessionId,captureId})})
 if(!response.ok||Number(response.headers.get('content-length'))>1024*1024||!response.body)throw Error('笔记附件引用已失效，请重新发送。')
 const reader=response.body.getReader(),chunks=[];let bytes=0
 try{
  while(true){active.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024)throw Error('笔记附件引用过多，请缩小范围。');chunks.push(Buffer.from(value))}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8'))
 if(!value||!Array.isArray(value.sources)||value.sources.length>1000)throw Error('笔记附件引用格式无效。')
 return value.sources
}

export async function loadNoteReferenceContent(sessionId,references,query,signal,options={}){
 const context={scope:references.scope,components:references.scope==='none'?[]:references.components.map(item=>({...item}))}
 const attachments=context.components.filter(item=>item.type==='attachment')
 if(!attachments.length||!references.captureId)return context
 if(typeof references.captureId!=='string'||references.captureId.length>256||typeof options.loadFileText!=='function')throw Error('笔记附件读取服务不可用。')
 const sources=await capturedSources(sessionId,references.captureId,options,signal)
 const read=createFrozenResearchFileLoader(options.loadFileText,{cooperativeCancellation:true})
 const maximum=Math.min(30000,Math.floor(240000/attachments.length))
 for(const component of attachments){
  signal.throwIfAborted()
  const source=sources.find(item=>item?.id===component.blockId&&item.kind==='file')
  if(!source){component.content+='\n[附件原文读取失败：当前引用没有此附件授权。]';continue}
  try{
   const {text}=await read(source,signal);signal.throwIfAborted()
   component.content=text.trim()?`附件正文（${component.title}）：\n${selectedResearchExcerpt(text,query,maximum)}`:'[附件中没有可提取的文字；扫描图像可能需要 OCR。]'
  }catch{signal.throwIfAborted();component.content+='\n[附件原文读取失败：文件已变化、格式不支持或内容暂不可读；请勿推断未读内容。]'}
 }
 return context
}
