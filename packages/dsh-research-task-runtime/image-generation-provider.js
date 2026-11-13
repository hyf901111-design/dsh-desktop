/** Image providers own transport/authentication; the conversation owns delivery. */
export class ImageGenerationError extends Error {}
const fail=message=>{throw new ImageGenerationError(message)}
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10])

export function validateGeneratedImage(data,maxBytes){
 if(!(data instanceof Uint8Array)||data.byteLength<24||data.byteLength>maxBytes||!Buffer.from(data.subarray(0,8)).equals(pngSignature))fail('图片模型未返回有效的 PNG 图片。')
 return data
}

export async function boundedImageJson(response,maxBytes){
 if(Number(response.headers.get('content-length'))>maxBytes)fail('图片响应过大，请降低尺寸或质量后重试。')
 const reader=response.body?.getReader();if(!reader)fail('图片模型返回了空响应。')
 const chunks=[];let total=0
 try{
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes)fail('图片响应过大，请降低尺寸或质量后重试。');chunks.push(value)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('图片模型响应无法解析，请稍后重试。')}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}

export function createOpenAIImageProvider(ctx,{fetch:request=globalThis.fetch}={}){
 return{
  models:[{id:'gpt-image-2.6-flare',name:'Image 2.6 Flare',description:'快速生成与迭代'},{id:'gpt-image-2.6-sunburst',name:'Image 2.6 Sunburst',description:'精细画面与复杂构图'}],
  async generate(input,{signal,maxBytes,assertCurrent}){
   const profile=ctx.get?.('settings')?.get('llm-pi-ai')?.providers?.openai
   if(profile?.baseURL){let url;try{url=new URL(profile.baseURL)}catch{};if(!url||url.origin!=='https://api.openai.com'||!['/v1','/v1/','/'].includes(url.pathname)||url.username||url.password||url.search||url.hash)fail('请在模型设置中配置 OpenAI 官方连接后生成图片。')}
   const ref=profile?.apiKeyEnv??'OPENAI_API_KEY'
   if(typeof ref!=='string'||!ref||ref.length>256)fail('OpenAI 凭据配置无效，请检查模型设置。')
   let key;try{key=(await ctx.get?.('credentials')?.resolve(ref))?.value}catch{fail('无法读取 OpenAI 凭据，请检查模型设置。')}
   if(typeof key!=='string'||!key.trim()||/[\r\n]/.test(key))fail('请先在设置 → 模型中配置 OpenAI API Key。')
   signal.throwIfAborted();assertCurrent?.()
   const fields={model:input.model,prompt:input.prompt,n:1,size:input.size,quality:input.quality,background:input.background,output_format:'png'}
   const editing=input.references.length>0
   let body
   if(editing){body=new FormData();for(const [name,value]of Object.entries(fields))body.set(name,String(value));input.references.forEach((image,i)=>body.append('image[]',new Blob([image.data],{type:image.mediaType}),`reference-${i}.${image.mediaType.split('/')[1]}`))}
   else body=JSON.stringify(fields)
   // Credential origin is fixed; never follow a redirect or retry a billed POST.
   const response=await request('https://api.openai.com/v1/images/'+(editing?'edits':'generations'),{method:'POST',redirect:'error',signal,headers:{authorization:`Bearer ${key}`,...editing?{}:{'content-type':'application/json'}},body})
   if(!response.ok){await response.body?.cancel().catch(()=>{});fail(response.status===401?'OpenAI 密钥无效，请检查模型设置。':response.status===403?'当前 OpenAI 项目尚无此图片模型权限。':response.status===429?'图片生成额度不足或请求过于频繁，请检查额度后重试。':response.status===400?'图片请求未通过模型校验，请调整描述或参数后重试。':'图片服务暂时不可用，请稍后重试。')}
   const result=await boundedImageJson(response,Math.ceil(maxBytes*4/3)+64*1024)
   if(!Array.isArray(result?.data)||result.data.length!==1)fail('图片模型未返回图片。')
   const encoded=result.data[0]?.b64_json
   if(typeof encoded!=='string'||!encoded.length||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('图片模型返回了无效的图片数据。')
   return{data:validateGeneratedImage(Buffer.from(encoded,'base64'),maxBytes),mediaType:'image/png'}
  }
 }
}
