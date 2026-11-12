import {createServer} from 'node:http'
import {test,expect} from 'vitest'
import {registerHostedAi,HOSTED_ARK_PROVIDER} from '../packages/dsh-research-task-runtime/hosted-ai.js'

test('the real model adapter only registers entitled chat models and uses its captured loopback generation',async()=>{
  const token='a'.repeat(64), requests=[]
  const model={id:'doubao-seed-2.1-lite',name:'Doubao Seed 2.1 Lite',contextWindow:1024000}
  let catalog={models:[],image:false}
  const server=createServer(async(req,res)=>{
    if(req.url==='/hosted-ai/catalog'){
      expect(req.headers.authorization).toBe('Bearer '+token)
      res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(catalog));return
    }
    const chunks=[]
    for await(const chunk of req)chunks.push(chunk)
    requests.push({path:req.url,auth:req.headers.authorization,data:JSON.parse(Buffer.concat(chunks))})
    res.writeHead(200,{'content-type':'text/event-stream'})
    const frame=(choices,usage)=>({id:'test',created:1,model:model.id,object:'chat.completion.chunk',choices,...usage?{usage}:{}})
    const rows=[frame([{index:0,delta:{role:'assistant',content:'你好'},finish_reason:null}]),
      frame([{index:0,delta:{},finish_reason:'stop'}]),frame([],{prompt_tokens:20,completion_tokens:5,total_tokens:25})]
    res.end(rows.map(row=>'data: '+JSON.stringify(row)+'\n\n').join('')+'data: [DONE]\n\n')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const route=new Map()
  const service=registerHostedAi({llm:{registerAdapter(ids,adapter){
    ids.forEach(id=>route.set(id,adapter));return()=>ids.forEach(id=>route.delete(id))
  }}},{bridge:JSON.stringify({url:'http://127.0.0.1:'+server.address().port+'/fund-research',token}),pollMs:10000})
  try{
    await service.refresh()
    expect(route.size).toBe(0)
    catalog={models:[model],image:true,generation:7}
    await service.refresh()
    const adapter=route.get(HOSTED_ARK_PROVIDER)
    expect(await adapter.listModels(HOSTED_ARK_PROVIDER)).toEqual([{provider:HOSTED_ARK_PROVIDER,id:model.id,name:model.name,inputModalities:['text']}])
    const chunks=[]
    for await(const chunk of adapter.stream({provider:HOSTED_ARK_PROVIDER,model:model.id,maxTokens:512,
      messages:[{role:'user',content:[{type:'text',text:'说你好'}]}]}))chunks.push(chunk)
    expect(JSON.stringify(chunks)).toContain('你好')
    expect(requests[0]).toMatchObject({path:'/hosted-ai/chat/completions',auth:'Bearer '+token+'.7',data:{model:model.id,stream:true}})
    expect(service.image.available()).toBe(true)
    const oldGenerate=service.image.capture()
    catalog={models:[],image:false}
    await service.refresh()
    expect(route.size).toBe(0)
    expect(service.image.available()).toBe(false)
    await expect(oldGenerate({},{signal:new AbortController().signal,maxBytes:100})).rejects.toThrow('账号已切换')
    expect(requests).toHaveLength(1)
  }finally{service.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
