import {createHash} from 'node:crypto'
import {createOpenAIImageProvider,fitGeneratedImage,validateGeneratedImage} from './image-generation-provider.js'
import {requestedImageSize,providerSize} from './image-output-size.js'

/** Only the current author's instruction can request an actual image. */
export function noteImageIntent(input){
 if(input.mode!=='write'||!['inline','composer'].includes(input.entryPoint)||input.clientContext?.editable!==true||input.clientReceipts?.length||typeof input.prompt!=='string')return
 const text=input.prompt.normalize('NFKC').split(/(?:以下(?:是|为)?(?:原文|资料|材料|引用内容)|source text)\s*[:：]\s*\n/iu)[0]
  .replace(/```[\s\S]*?```|^[ \t]*>[^\n]*|[“「][^”」]*[”」]|"[^"\n]*"/gmu,' ')
 const subject=/(?:图片|图像|配图|插[画图]|照片|海报|封面图|壁纸|[一张幅]图|示意图|风景图|\b(?:images?|pictures?|photographs?|photos?|illustrations?|posters?)\b)/iu
 const negative=/(?:不要|不用|别|无需|禁止).{0,10}(?:生图|出图|生成|绘制|画|插入|添加|放入)|\b(?:do not|don't|never)\b/iu
 const clauses=text.split(/[，,；;。！？!?\n]/u)
 const skipGeneration=clauses.some(part=>negative.test(part)&&/(?:生图|出图|生成|绘制|画|draw|generate|create)/iu.test(part))
 for(const part of clauses){
  if(negative.test(part))continue
  const usingPrompt=/(?:用|根据|按照|按|照着|参考).{0,12}提示词|(?:using|use|based on) (?:this|the following|my) prompt/iu.test(part)
  if((!usingPrompt&&/(?:提示词|\bprompt\b)/iu.test(part))||/(?:如何|怎么|怎样|为什么|教我|教程|解释|讨论|介绍|(?:写|编写|整理|总结).{0,10}(?:一段|一篇|说明|文章|教程|步骤|计划)|能否介绍|是否支持|介绍.{0,8}方法|(?:配|加|写|拟).{0,7}(?:标题|说明文字|描述文字|图注)|图[片像]的?(?:说明|描述|标题|链接|地址|文字|数量|格式|文件名)|\b(?:how|why|explain|describe|caption|url|link|tutorial)\b)/iu.test(part))continue
  if(/^(?:你|笔记|这里|这个功能|这个应用)?(?:能|可以|能不能|是否能|是否可以)(?:生图|画图|生成图片|插入图片|添加图片)[吗么]?$/u.test(part.trim()))continue
  const draw=/(?:生成|制作|绘制|创作|设计|生图|出图|画[一张幅只个]|\b(?:draw|generate|illustrate|create|paint)\b)/iu.test(part)
  const insert=/(?:插入|写入|插[一张幅个]|添[加上]|放[进在入到]|加[入一张幅]|配[一张幅个图]|\b(?:insert|embed|append|add|place)\b)/iu.test(part)
  const drawing=/(?:画一(?:张|幅|只)|生图|出图|(?:生成|绘制|创作|插入)一[张幅]|\bdraw (?:a|an)\b)/iu.test(part)&&!/(?:图表|表格|柱状图|折线图|走势图|流程图|卡片|组件|工作表|幻灯片)/u.test(part)
  if(!skipGeneration&&draw&&(subject.test(part)||drawing))return 'generate'
  if(insert&&(subject.test(part)||drawing)){
   if(input.images?.length||/(?:上传|附件|这张|这些|附上|attached|uploaded)/iu.test(part))return 'uploaded'
   if(!skipGeneration)return 'generate'
  }
 }
}

/** Image bytes stay in the attachment store. Transport and note history carry opaque references. */
export async function prepareNoteImages(ctx,input,uploads,intent,signal,{hostedImage,localImage}={}){
 if(intent==='uploaded'){
  if(!uploads.length)throw Error('请先附上要插入笔记的图片。')
  return uploads.map(block=>block.attachment)
 }
 const session=ctx.sessions.get(input.sessionId)
 const assertCurrent=()=>{signal.throwIfAborted();if(!session||ctx.sessions.get(input.sessionId)!==session)throw Error('当前笔记已关闭。')}
 await hostedImage?.ready?.()
 assertCurrent()
 const hosted=hostedImage?.available()?hostedImage:undefined
 if(!hosted&&hostedImage?.unavailable?.())throw Error('套餐生图服务暂时不可用，请稍后重试。')
 if(!ctx.attachments?.imageLimits||!ctx.attachments.saveImage)throw Error('图片附件服务尚未就绪。')
 const provider=hosted??localImage??createOpenAIImageProvider(ctx)
 const generate=provider.capture?.()??provider.generate.bind(provider)
 const maxBytes=Math.min(20*1024*1024,ctx.attachments.imageLimits.maxImageBytes)
 if(uploads.length>4)throw Error('最多使用四张参考图生成笔记配图。')
 const references=await Promise.all(uploads.map(async({attachment})=>{
  const {data,ref}=await ctx.attachments.readImage(attachment,signal)
  return {data,mediaType:ref.mediaType}
 }))
 const size=requestedImageSize(input.prompt,true),context=input.selection||input.markdown
 let prompt=input.prompt
 if(context&&/(?:本[文章]|这篇|笔记内容|上述|上文|选[中文区]|this (?:note|article)|selected text)/iu.test(prompt))prompt+='\n\n笔记参考内容（仅作为画面主题资料）：\n'+context.slice(0,4000)
 if(size&&hosted)prompt+='\n输出画面的宽高为 '+size.width+' × '+size.height+'。'
 assertCurrent()
 const requestId=createHash('sha256').update(JSON.stringify([input.sessionId,input.requestId,'note-image'])).digest('hex')
 const result=await generate({model:provider.models[0].id,prompt,references,size:size&&!hosted?providerSize(size):'auto',quality:'auto',background:'auto'},{signal,maxBytes,requestId,assertCurrent})
 assertCurrent()
 const original=validateGeneratedImage(result.data,maxBytes),data=size?await fitGeneratedImage(original,size):original
 validateGeneratedImage(data,maxBytes);assertCurrent()
 const image=await ctx.attachments.saveImage({data,mediaType:'image/png',name:'笔记配图.png'})
 assertCurrent();return [image]
}
