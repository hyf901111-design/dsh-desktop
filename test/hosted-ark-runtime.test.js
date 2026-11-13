import {createServer} from 'node:http'
import {test,expect,vi} from 'vitest'
import {registerHostedAi,HOSTED_ARK_PROVIDER} from '../packages/dsh-research-task-runtime/hosted-ai.js'

test('the real model adapter only registers entitled chat models and uses its captured loopback generation',async()=>{
  const token='a'.repeat(64), requests=[]
  const model={id:'doubao-seed-2.1-lite',name:'Doubao Seed 2.1 Lite',contextWindow:1024000}
  let catalog={models:[],image:false}
  let catalogStatus=200
  const image = (id,bytes) => ({type:'image',attachment:{attachmentId:String(id),bytes,mediaType:'image/png'}})
  const server=createServer(async(req,res)=>{
    if(req.url==='/hosted-ai/catalog'){
      expect(req.headers.authorization).toBe('Bearer '+token)
      res.writeHead(catalogStatus,{'content-type':'application/json'}).end(JSON.stringify(catalog));return
    }
    const chunks=[]
    for await(const chunk of req)chunks.push(chunk)
    requests.push({path:req.url,auth:req.headers.authorization,data:JSON.parse(Buffer.concat(chunks))})
    if (requests.at(-1).data.messages[0].content === 'quota-denied') {
      res.writeHead(429,{'content-type':'application/json'}).end(JSON.stringify({error:{code:'AI_QUOTA_FIVE_HOUR',message:'本 5 小时可用额度不足'}}))
      return
    }
    res.writeHead(200,{'content-type':'text/event-stream'})
    const frame=(choices,usage)=>({id:'test',created:1,model:model.id,object:'chat.completion.chunk',choices,...usage?{usage}:{}})
    const rows=[frame([{index:0,delta:{role:'assistant',content:'你好'},finish_reason:null}]),
      frame([{index:0,delta:{},finish_reason:'stop'}]),frame([],{prompt_tokens:20,completion_tokens:5,total_tokens:25})]
    res.end(rows.map(row=>'data: '+JSON.stringify(row)+'\n\n').join('')+'data: [DONE]\n\n')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const route=new Map()
  const service=registerHostedAi({get:()=>({readImage:async ref=>({ref,data:Buffer.alloc(ref.bytes,Number(ref.attachmentId))})}),llm:{registerAdapter(ids,adapter){
    ids.forEach(id=>route.set(id,adapter));return()=>ids.forEach(id=>route.delete(id))
  }}},{bridge:JSON.stringify({url:'http://127.0.0.1:'+server.address().port+'/fund-research',token}),pollMs:10000})
  try{
    await service.refresh()
    expect(route.size).toBe(0)
    catalog={models:[model],image:true,generation:7}
    await service.refresh()
    const adapter=route.get(HOSTED_ARK_PROVIDER)
    expect(adapter.providerRetryPolicy(HOSTED_ARK_PROVIDER)).toMatchObject({
      mode:'normal',maxRetries:0,retryableCodes:expect.arrayContaining(['RATE_LIMIT','TRANSPORT'])
    })
    expect(await adapter.listModels(HOSTED_ARK_PROVIDER)).toEqual([{provider:HOSTED_ARK_PROVIDER,id:model.id,name:model.name,inputModalities:['text']}])
    const chunks=[]
    for await(const chunk of adapter.stream({provider:HOSTED_ARK_PROVIDER,model:model.id,maxTokens:512,
      messages:[{role:'user',content:[{type:'text',text:'说你好'}]}]}))chunks.push(chunk)
    expect(JSON.stringify(chunks)).toContain('你好')
    expect(requests[0]).toMatchObject({path:'/hosted-ai/chat/completions',auth:'Bearer '+token+'.7',data:{model:model.id,stream:true}})
    expect(service.image.available()).toBe(true)
    catalog={...catalog,models:[{...model,supportsImageInput:true}]}
    await service.refresh()
    const visionAdapter=route.get(HOSTED_ARK_PROVIDER)
    const run=async messages=>{
      const events=[]
      for await(const event of visionAdapter.stream({provider:HOSTED_ARK_PROVIDER,model:model.id,maxTokens:512,messages}))events.push(event)
      return events.at(-1)
    }
    const history=[image(1,3_000_000),image(2,3_000_000),image(3,4_000_000)]
    expect(await run(history.map(part=>({role:'user',content:[part]})))).toMatchObject({type:'finish',reason:{kind:'stop'}})
    const contents=requests[1].data.messages.map(message=>message.content)
    expect(contents[0]).toEqual([{type:'text',text:'[较早的图片未随本次请求发送]'}])
    expect(contents.slice(1).every(content=>content[0].type==='image_url')).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(requests[1].data))).toBeLessThan(12_000_000)
    expect(await run([{role:'user',content:[image(4,9_000_000)]}])).toMatchObject({
      type:'finish',reason:{kind:'error',failure:{message:expect.stringContaining('请压缩图片')}}
    })
    expect(await run([{role:'user',content:[{type:'text',text:'quota-denied'}]}])).toMatchObject({
      type:'finish',reason:{kind:'error',failure:{code:'AI_QUOTA_FIVE_HOUR',message:'5 小时剩余额度不足以开始本次模型调用。'}}
    })
    const oldGenerate=service.image.capture()
    const lastCatalog=catalog
    catalogStatus=502
    catalog={error:{code:'BAD_GATEWAY'}}
    await service.refresh()
    expect(route.get(HOSTED_ARK_PROVIDER)).toBe(visionAdapter)
    expect(service.image.available()).toBe(true)
    catalogStatus=503
    catalog={generation:8,status:'unavailable'}
    await service.refresh()
    expect(route.size).toBe(0)
    expect(service.image.available()).toBe(false)
    expect(service.image.unavailable()).toBe(true)
    await expect(oldGenerate({},{signal:new AbortController().signal,maxBytes:100})).rejects.toThrow('账号已切换')
    catalogStatus=200
    catalog={...lastCatalog,generation:8}
    await service.refresh()
    expect(service.image.available()).toBe(true)
    catalog={models:[],image:false}
    await service.refresh()
    expect(route.size).toBe(0)
    expect(service.image.available()).toBe(false)
    expect(service.image.unavailable()).toBe(false)
    await expect(oldGenerate({},{signal:new AbortController().signal,maxBytes:100})).rejects.toThrow('账号已切换')
    expect(requests).toHaveLength(3)
  }finally{service.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})

test('a Seedream response completed after the account changes is discarded', async () => {
  const token = 'a'.repeat(64)
  const model = { id: 'glm-5.3-flash', name: 'GLM 5.3 Flash', contextWindow: 200000 }
  let generation = 1
  let complete
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII='
  const response = new Response(new ReadableStream({
    start(controller) {
      complete = () => {
        controller.enqueue(Buffer.from(JSON.stringify({ data: png })))
        controller.close()
      }
    }
  }))
  const request = vi.fn(async path => path.endsWith('/catalog')
    ? Response.json({ models: [model], image: true, generation }) : response)
  const service = registerHostedAi({ llm: { registerAdapter: () => () => {} } }, {
    bridge: JSON.stringify({ url: 'http://127.0.0.1:6789/fund-research', token }),
    request, pollMs: 60000
  })
  try {
    await service.refresh()
    const pending = service.image.capture()({ model: 'doubao-seedream-5.0-flash', references: [] }, {
      signal: new AbortController().signal, maxBytes: 100, requestId: 'f'.repeat(64)
    })
    const rejected = expect(pending).rejects.toThrow('账号已切换')
    await vi.waitFor(() => expect(response.body.locked).toBe(true))
    expect(request.mock.lastCall[1].headers).toMatchObject({ 'x-ework-request-id': 'f'.repeat(64) })
    generation++
    await service.refresh()
    complete()
    await rejected
  } finally { service.dispose() }
})
