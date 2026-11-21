import {afterEach, expect, it, vi} from 'vitest'
import {registerImageGenerationTool,conversationImageReferences} from '../packages/dsh-research-task-runtime/image-generation-tool.js'
import {imageFactoryPrompt} from '../packages/dsh-research-task-runtime/image-factory-context.js'
import sharp from 'sharp'

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=','base64')
const cleanups=[]
afterEach(async()=>{await Promise.all(cleanups.splice(0).map(fn=>fn()))})
function fixture({uploaded=false,...options}={}){
 const tools=new Map(),prompts=[],saved=[],reads=[],state={live:true,key:'test-private-key',profile:{apiKeyEnv:'CUSTOM_IMAGE_KEY'}}
 const ref={attachmentId:'user-image',mediaType:'image/png',bytes:png.length,width:1,height:1,name:'参考图.png'}
 const agent={id:'chat',session:{id:'chat',header:{cwd:'/workspace'},events:[{type:'turn/start',data:{turn:1}},{type:'user/message',data:{id:'human-1',source:{kind:'user'},content:[{type:'text',text:'画一只猫'},...(uploaded?[{type:'image',attachment:ref}]:[])]}}]}}
 const attachments={imageLimits:{maxImageBytes:20*1024*1024},readImage:async r=>{reads.push(r);return{ref:r,data:png}},saveImage:async input=>{saved.push(input);return{...ref,attachmentId:'generated-'+saved.length,name:input.name}}}
 const credentials={resolve:vi.fn(async()=>state.key?{value:state.key}:undefined)}
 const ctx={tools:{register:t=>{tools.set(t.name,t);return()=>tools.delete(t.name)},schemas:()=>[...tools.values()]},agents:{get:()=>state.live?agent:undefined},systemPrompt:{context:p=>{prompts.push(p);return()=>{}}},get:n=>({attachments,credentials,settings:{get:()=>({providers:{openai:state.profile}})}}[n])}
 const request=vi.fn(async()=>new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]})))
 const dispose=registerImageGenerationTool(ctx,{fetch:request,...options});cleanups.push(dispose)
 const concludeTurn=vi.fn()
 const call=(args={},signal,scope={})=>tools.get('image_generate').execute({prompt:'水彩橘猫',...args},{agent,callId:'call-'+Math.random(),signal,concludeTurn,...scope})
 return{tools,prompts,state,agent,attachments,credentials,request,saved,reads,call,ref,concludeTurn}
}
it('generates using the configured credential and returns a durable native image without credentials',async()=>{
 const f=fixture(),result=await f.call()
 expect(result).toMatchObject({kind:'odyssey-image-generation',ok:true,model:'gpt-image-2.6-flare',image:{attachmentId:'generated-1'}})
 expect(f.credentials.resolve).toHaveBeenCalledWith('CUSTOM_IMAGE_KEY')
 const [url,init]=f.request.mock.calls[0]
 expect(url).toBe('https://api.openai.com/v1/images/generations');expect(init.redirect).toBe('error')
 expect(JSON.parse(init.body)).toMatchObject({model:'gpt-image-2.6-flare',prompt:'水彩橘猫',n:1,output_format:'png'})
 expect(f.saved[0].data).toEqual(png)
 expect(JSON.stringify(f.tools.get('image_generate').output.render({},result))).not.toContain(f.state.key)
 expect(f.tools.get('image_generate').output.render({},result)[1]).toEqual({type:'image',attachment:result.image})
 expect(f.prompts[0].text({agent:f.agent})).toContain('image_generate')
})
it('deduplicates concurrent and repeated requests for the same human instruction, but permits the next request',async()=>{
 const f=fixture(),[a,b]=await Promise.all([f.call(),f.call()]);expect(a).toEqual(b)
 expect(await f.call()).toEqual(a);expect(f.request).toHaveBeenCalledTimes(1)
 f.agent.session.events.push({type:'user/message',data:{id:'human-2',source:{kind:'user'},content:[{type:'text',text:'再画一张'}]}})
 await f.call();expect(f.request).toHaveBeenCalledTimes(2)
})
it('edits only images already present in this session',async()=>{
 const f=fixture({uploaded:true});await f.call({reference_image_ids:[f.ref.attachmentId]})
 expect(f.reads).toEqual([f.ref]);const [url,init]=f.request.mock.calls[0]
 expect(url).toContain('/images/edits');expect(init.body).toBeInstanceOf(FormData);expect(init.body.get('image[]')).toBeInstanceOf(Blob)
 await expect(f.call({reference_image_ids:['another-session-image']})).rejects.toThrow(/当前会话/)
 expect(f.request).toHaveBeenCalledTimes(1)
})
it('routes the factory crop and concludes a standalone edit through the native turn lifecycle',async()=>{
 const f=fixture({uploaded:true}),content=f.agent.session.events[1].data.content
 const workspace={id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'蓝色海报',operation:'region',
  size:'1024x1536',width:180,height:300,internalReference:true}
 content[0].text=imageFactoryPrompt('把这里换成蓝色',workspace)
 content.splice(1,0,{type:'image',attachment:{...f.ref,attachmentId:'older'}})
 const args={size:'1536x1024',reference_image_ids:['older']}
 const result=await f.call({...args,continue_after_delivery:true})
 expect(f.reads).toEqual([f.ref])
 expect(f.request.mock.calls[0][1].body.get('size')).toBe('1024x1536')
 expect(result.factory).toEqual({id:workspace.id,title:workspace.title,operation:'region'})
 expect(f.concludeTurn).not.toHaveBeenCalled()
 expect(await f.call(args,undefined,{parent:Symbol('code-mode')})).toEqual(result)
 expect(f.concludeTurn).not.toHaveBeenCalled()
 f.concludeTurn.mockImplementationOnce(()=>expect(f.saved).toHaveLength(1))
 expect(await f.call(args)).toEqual(result)
 expect(f.request).toHaveBeenCalledOnce()
 expect(f.concludeTurn).toHaveBeenCalledOnce()
 expect(result.guidance).toContain('已放入当前图像画布')
 expect(f.prompts[0].text({agent:f.agent})).toContain('180 × 300')
})
it('sends the current canvas first and appended mood references next for whole-image edits', async () => {
 const f=fixture({uploaded:true})
 const {content}=f.agent.session.events[1].data
 const palette={...f.ref,attachmentId:'palette',name:'色卡.png'}
 content[0].text=imageFactoryPrompt('参考色卡修改花朵颜色', {
  id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'花市海报',operation:'edit',
  size:'1024x1536',width:1080,height:1350,internalReference:true
 })
 content.splice(1,0,{type:'image',attachment:palette})
 await f.call({prompt:'参考色卡修改花朵颜色',reference_image_ids:[palette.attachmentId]})
 expect(f.reads).toEqual([f.ref,palette])
 expect(f.request.mock.calls[0][1].body.get('prompt')).toContain('第一张参考图是要编辑的画布')
})
it('requires the promised canvas reference before dispatching an edit', async () => {
 const f=fixture()
 f.agent.session.events[1].data.content[0].text=imageFactoryPrompt('修改当前图', {
  id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'花市海报',operation:'edit',
  size:'1024x1536',width:1080,height:1350,internalReference:true
 })
 await expect(f.call()).rejects.toThrow('当前画布未能作为图片参考')
 expect(f.request).not.toHaveBeenCalled()
})
it('uses the hosted image model mask to deliver an aligned transparent PNG with the original foreground colors',async()=>{
 const width=12,height=6
 const rgba=Buffer.from(Array.from({length:width*height},(_,i)=>[170,70,35,i%width===7?150:255]).flat())
 const source=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer()
 const generate=vi.fn(async({references})=>{
  const {data,info}=await sharp(references[0].data).removeAlpha().raw().toBuffer({resolveWithObject:true})
  const mask=Buffer.from(Array.from({length:info.width*info.height},(_,pixel)=>pixel%info.width>=info.width/2&&data[pixel*3]>20?255:0))
  return {data:await sharp(mask,{raw:{width:info.width,height:info.height,channels:1}}).png().toBuffer()}
 })
 const f=fixture({uploaded:true,hosted:{models:[{id:'mask-model'}],available:()=>true,generate}})
 f.attachments.readImage=async ref=>({ref,data:source})
 f.agent.session.events[1].data.content[0].text=imageFactoryPrompt('去除背景',{
  id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'商品照片',operation:'cutout',
  size:'1536x1024',width,height,internalReference:true
 })
 const result=await f.call({
  prompt:'把背景换成红色',background:'transparent',reference_image_ids:[],
  foreground_subjects:['画面右半部的银色泵头瓶，瓶身上有紫色透明环']
 })
 expect(generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
  prompt:expect.stringContaining('前景分割遮罩'),background:'opaque',size:'1536x1024'
 }),expect.anything())
 const maskPrompt=generate.mock.calls[0][0].prompt
 expect(maskPrompt).toContain('画面右半部的银色泵头瓶，瓶身上有紫色透明环')
 expect(maskPrompt).not.toContain('把背景换成红色')
 expect(f.prompts[0].text({agent:f.agent})).toContain('foreground_subjects')
 expect(await f.call({foreground_subjects:['右侧瓶子']})).toEqual(result)
 expect(generate).toHaveBeenCalledTimes(1)
 expect(result).toMatchObject({factory:{operation:'cutout'},guidance:expect.stringContaining('透明通道')})
 const output=await sharp(f.saved[0].data).raw().toBuffer({resolveWithObject:true})
 expect(output.info).toMatchObject({width,height,channels:4})
 const pixel=(x,y)=>Array.from(output.data.subarray((y*width+x)*4,(y*width+x+1)*4))
 expect(pixel(1,3)).toEqual([0,0,0,0])
 expect(pixel(7,3)).toEqual([170,70,35,150])
 expect(pixel(10,3)).toEqual([170,70,35,255])
})

it('sends the framed selection to the image provider with its bounds and full-frame composition',async()=>{
 const f=fixture({uploaded:true})
 f.agent.session.events[1].data.content[0].text=imageFactoryPrompt('只移动选区里的花', {
  id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'海报',operation:'region',
  size:'1536x1024',width:180,height:30,internalReference:true,
  editBounds:{left:.1,top:.45,right:.9,bottom:.55}
 })
 await f.call({prompt:'给花换颜色'})
 const body=f.request.mock.calls[0][1].body
 expect(body.get('size')).toBe('1536x1024')
 expect(body.get('prompt')).toContain('给花换颜色')
 expect(body.get('prompt')).toContain('水平 10% 至 90%、垂直 45% 至 55%')
 expect(f.prompts[0].text({agent:f.agent})).toContain('返回完整参考画面')
})
it('uses the current upload directly and concludes only a successfully delivered standalone request',async()=>{
 const f=fixture({uploaded:true})
 const result=await f.call({continue_after_delivery:true})
 expect(f.request.mock.calls[0][0]).toContain('/images/edits')
 expect(f.reads).toEqual([f.ref])
 expect(f.concludeTurn).not.toHaveBeenCalled()
 expect(await f.call({},undefined,{parent:Symbol('code-mode')})).toEqual(result)
 expect(f.concludeTurn).not.toHaveBeenCalled()
 f.concludeTurn.mockImplementationOnce(()=>expect(f.saved).toHaveLength(1))
 expect(await f.call()).toEqual(result)
 expect(f.request).toHaveBeenCalledTimes(1)
 expect(f.concludeTurn).toHaveBeenCalledOnce()
 const noReference=fixture({uploaded:true})
 await noReference.call({reference_image_ids:[]})
 expect(noReference.reads).toEqual([])
 expect(noReference.request.mock.calls[0][0]).toContain('/images/generations')
})
it('rejects arbitrary URLs, unknown models, invalid sizes, excess references and delegate sessions before billing',async()=>{
 const f=fixture()
 for(const args of[{url:'https://other.test'},{model:'not-a-model'},{size:'9999x9999'},{prompt:' '},{reference_image_ids:Array(5).fill('user-image')}])await expect(f.call(args)).rejects.toThrow()
 f.agent.session.header.origin='subagent';await expect(f.call()).rejects.toThrow(/主会话/)
 expect(f.request).not.toHaveBeenCalled()
})
it('never starts a request without credentials or with a custom endpoint credential',async()=>{
 const f=fixture();f.state.key='';await expect(f.call()).rejects.toThrow(/OpenAI/)
 f.state.key='test';f.state.profile.baseURL='https://other.test/v1';await expect(f.call({prompt:'另一只猫'})).rejects.toThrow(/官方/)
 expect(f.request).not.toHaveBeenCalled()
})
it('does not repeat a failed paid call or reflect provider errors / keys',async()=>{
 const f=fixture();f.request.mockResolvedValue(new Response(JSON.stringify({error:{message:'test-private-key secret'}}),{status:429}))
 await expect(f.call()).rejects.toThrow(/额度|频率/);await expect(f.call()).rejects.toThrow(/额度|频率/)
 expect(f.request).toHaveBeenCalledTimes(1);expect(f.saved).toHaveLength(0)
 expect(f.concludeTurn).not.toHaveBeenCalled()
})
it('cancellation discards late success and exposes no generated image',async()=>{
 const f=fixture(),controller=new AbortController();let resolve,started
 const ready=new Promise(r=>started=r);f.request.mockImplementation(()=>{started();return new Promise(r=>resolve=r)})
 const pending=f.call({},controller.signal);await ready;controller.abort()
 resolve(new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]})))
 await expect(pending).rejects.toThrow(/取消/);expect(f.saved).toHaveLength(0)
})
it('rejects late results when the live session or human authority changes',async()=>{
 const f=fixture();f.request.mockImplementation(async()=>{f.state.live=false;return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))})
 await expect(f.call()).rejects.toThrow(/会话/);expect(f.saved).toHaveLength(0)
})
it('bounds and validates provider response before publishing an attachment',async()=>{
 const f=fixture();f.request.mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:Buffer.from('not an image').toString('base64')}]})))
 await expect(f.call()).rejects.toThrow(/图片/);expect(f.saved).toHaveLength(0)
 f.request.mockResolvedValue(new Response('{}',{headers:{'content-length':'999999999'}}))
 await expect(f.call({prompt:'different'})).rejects.toThrow(/过大/)
})
it('supports a future built-in provider without changing the tool or image UI',async()=>{
 const generate=vi.fn(async()=>({data:png,mediaType:'image/png'}))
 const f=fixture({providers:[{models:[{id:'builtin-art',name:'内置生图'}],generate}],defaultModel:'builtin-art'})
 const result=await f.call();expect(result.model).toBe('builtin-art');expect(generate).toHaveBeenCalledOnce();expect(f.request).not.toHaveBeenCalled()
})
it('preserves the requested factory aspect ratio when the hosted gateway maps fixed sizes to presets',async()=>{
 const generate=vi.fn(async()=>({data:png,mediaType:'image/png'}))
 const hosted={available:()=>true,models:[{id:'seedream-flash',name:'Seedream Flash'}],generate}
 const f=fixture({hosted})
 const workspace={id:'11898f5e-5fab-4913-b241-267ac863be0c',title:'留白海报',operation:'generate',
   size:'1024x1536',width:1080,height:1350,internalReference:false}
 f.agent.session.events[1].data.content[0].text=imageFactoryPrompt('制作一张宽高比为 4:5 的海报',workspace)
 const result=await f.call({prompt:'制作一张留白海报',size:'1024x1536'})
 const [forwarded]=generate.mock.calls[0]
 expect(forwarded.size).toBe('auto')
 expect(forwarded.prompt).toContain('宽高比为 4:5')
 expect(result.guidance).toContain('1080 × 1350')
})

it('uses Seedream for stale OpenAI model arguments when hosted image generation is available',async()=>{
 const generate=vi.fn(async()=>({data:png,mediaType:'image/png'}))
 let available=true
 const hosted={available:()=>available,models:[{id:'doubao-seedream-5.5',name:'Seedream 5.5'}],generate,
  resolveModel:id=>id==='doubao-seedream-5-0-pro'?'doubao-seedream-5.5':id}
 const f=fixture({uploaded:true,hosted})
 const result=await f.call({model:'gpt-image-2.6-sunburst'})
 expect(result.model).toBe('doubao-seedream-5.5')
 expect(await f.call()).toEqual(result)
 expect(await f.call({model:'doubao-seedream-5-0-pro'})).toEqual(result)
 expect(generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({model:'doubao-seedream-5.5',references:[expect.objectContaining({data:png})]}),expect.objectContaining({requestId:expect.stringMatching(/^[0-9a-f]{64}$/)}))
 expect(f.prompts[0].text({agent:f.agent})).not.toContain('gpt-image')
 expect(f.credentials.resolve).not.toHaveBeenCalled()
 expect(f.request).not.toHaveBeenCalled()
 available=false
 expect((await f.call({model:'gpt-image-2.6-sunburst'})).model).toBe('gpt-image-2.6-sunburst')
 expect(f.request).toHaveBeenCalledOnce()
})
it('keeps image requests on the hosted route while the account catalog is unavailable', async () => {
 const generate = vi.fn()
 const f = fixture({hosted:{
  available:()=>false, unavailable:()=>true, models:[{id:'seedream-flash',name:'Seedream Flash'}], generate
 }})
 await expect(f.call({model:'gpt-image-2.6-sunburst'})).rejects.toThrow('套餐生图服务暂时不可用')
 expect(f.prompts[0].text({agent:f.agent})).not.toContain('gpt-image')
 expect(f.credentials.resolve).not.toHaveBeenCalled()
 expect(f.request).not.toHaveBeenCalled()
 expect(generate).not.toHaveBeenCalled()
})
it('waits for initial hosted discovery before choosing the image provider', async () => {
 let ready, available = false
 const pending = new Promise(resolve => { ready = resolve })
 const generate = vi.fn(async () => ({ data: png, mediaType: 'image/png' }))
 const f = fixture({hosted:{
  ready:()=>pending, available:()=>available, models:[{id:'seedream-flash',name:'Seedream Flash'}], generate
 }})
 const image = f.call()
 await Promise.resolve()
 expect(f.request).not.toHaveBeenCalled()
 available = true
 ready()
 expect(await image).toMatchObject({model:'seedream-flash'})
 expect(generate).toHaveBeenCalledOnce()
 expect(f.request).not.toHaveBeenCalled()
})
it('recovers code-mode image receipts after restart and permits editing them in the next turn',async()=>{
 const f=fixture(),result=await f.call(),content=f.tools.get('image_generate').output.render({},result)
 const events=[...f.agent.session.events,{type:'tool/code-dispatch',data:{name:'image_generate',isError:false,content}},{type:'user/message',data:{source:{kind:'plugin',plugin:'tools-code-mode'},content}}]
 expect(conversationImageReferences({events}).has(result.image.attachmentId)).toBe(true)
 const fresh=fixture();fresh.agent.session.events=events
 expect(await fresh.call()).toEqual(result);expect(fresh.request).not.toHaveBeenCalled()
 fresh.agent.session.events.push({type:'user/message',data:{id:'human-2',source:{kind:'user'},content:[{type:'text',text:'修改刚才的图片'}]}})
 await fresh.call({prompt:'换成蓝色',reference_image_ids:[result.image.attachmentId]})
 expect(fresh.reads).toEqual([result.image])
})
it('rechecks the live human authority after credentials resolve, before a billed POST',async()=>{
 const f=fixture();let release,started
 const ready=new Promise(r=>started=r)
 f.credentials.resolve.mockImplementation(()=>{started();return new Promise(r=>release=r)})
 const pending=f.call();await ready
 f.agent.session.events.push({type:'user/message',data:{id:'human-2',source:{kind:'user'},content:[{type:'text',text:'不用生成了'}]}})
 release({value:'test-private-key'})
 await expect(pending).rejects.toThrow(/会话|要求/);expect(f.request).not.toHaveBeenCalled()
})

it('validates targeted edits by layer type and emits a patch without rasterizing text', async () => {
 const f=fixture(),content=f.agent.session.events[1].data.content
 const edit=f.tools.get('image_edit_layer'),exec={agent:f.agent,concludeTurn:f.concludeTurn}
 await expect(edit.execute({text:'新品发布'},exec)).rejects.toThrow('选择要修改的图层')
 const id='11898f5e-5fab-4913-b241-267ac863be0c'
 const workspace={id,title:'企业模板',operation:'layer',size:'1024x1536',width:1080,height:1350,
  internalReference:false,targetLayer:{kind:'text',label:'主标题',description:'原始标题'}}
 content[0].text=imageFactoryPrompt('把标题改为新品发布',workspace)
 expect(f.prompts[0].text({agent:f.agent})).toContain('image_edit_layer')
 await expect(f.call()).rejects.toThrow('image_edit_layer')
 await expect(edit.execute({asset:'logo-blue'},exec)).rejects.toThrow('无法应用')
 expect(await edit.execute({text:'新品发布'},exec)).toEqual({kind:'odyssey-image-layer-edit',id,patch:{text:'新品发布'}})
 expect(f.request).not.toHaveBeenCalled()
 expect(f.concludeTurn).toHaveBeenCalledOnce()
})

it('routes mixed layer edits to their explicit numbers and keeps the turn open for the other layers', async () => {
 const f=fixture({uploaded:true}),content=f.agent.session.events[1].data.content
 const id='11898f5e-5fab-4913-b241-267ac863be0c'
 const targetLayers=[{key:1,kind:'text',label:'主标题',description:'旧标题'},
  {key:2,kind:'image',label:'图片',description:''},{key:3,kind:'shape',label:'版式色块',description:'#005098'}]
 content[0].text=imageFactoryPrompt('把〔图层 1：主标题〕改为新品发布，〔图层 2：图片〕换成雪山，同时将〔图层 3：版式色块〕改为黑色。',{
  id,title:'易方达模板',operation:'layer',size:'1024x1536',width:1080,height:1350,internalReference:true,targetLayers
 })
 const edit=f.tools.get('image_edit_layer'),exec={agent:f.agent,concludeTurn:f.concludeTurn}
 await expect(edit.execute({text:'新品发布'},exec)).rejects.toThrow('编号')
 await expect(edit.execute({target:2,text:'新品发布'},exec)).rejects.toThrow('编号')
 await expect(f.call({layer_target:3})).rejects.toThrow('编号')
 const raster=await f.call({layer_target:2,prompt:'换成雪山'})
 expect(raster.factory).toMatchObject({id,layerTarget:2})
 expect(await f.call({layer_target:2,prompt:'雪山日出'})).toEqual(raster)
 expect(f.request).toHaveBeenCalledOnce()
 expect(f.reads).toEqual([f.ref])
 expect(await edit.execute({target:1,text:'新品发布'},exec)).toMatchObject({id,target:1,patch:{text:'新品发布'}})
 expect(await edit.execute({target:3,color:'#000000'},exec)).toMatchObject({id,target:3,patch:{color:'#000000'}})
 expect(f.prompts[0].text({agent:f.agent})).toContain('根据每个标签在句子中的位置和上下文')
 expect(f.concludeTurn).not.toHaveBeenCalled()
})

it('blocks model-initiated image generation on an image-workspace discussion before accessing the paid provider',async()=>{
 const f=fixture({uploaded:true})
 const user=f.agent.session.events.findLast(event=>event.type==='user/message').data
 user.source={kind:'user',clientMode:'image'}
 user.content=[{type:'text',text:imageFactoryPrompt('给我三条构图建议，不用改图。',{id:'12345678-aaaa-4aaa-8aaa-123456789012',operation:'edit',size:'1024x1024',width:1024,height:1024,title:'海报',internalReference:true})}]
 await expect(f.call()).rejects.toThrow('没有要求生成或修改')
 expect(f.request).not.toHaveBeenCalled()
 expect(f.prompts[0].text({agent:f.agent})).toBe('')
})
