import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { clientModeTurn, disallowedModeTool, modeProfilePrompt, routeModeTools } from '../packages/dsh-research-task-runtime/client-mode-profile.js'
import { registerConversationComponentsPolicy } from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import { registerClientTools } from '../packages/dsh-research-task-runtime/client-tools.js'
import { KnowledgeStore } from '../src/main/knowledge/store'
import { knowledgeCapabilityHandlers } from '../src/main/knowledge/capabilities'
import { ClientCapabilityService } from '../src/main/state/client-capability-service'

const title = '易方达沪深300交易型开放式指数发起式证券投资基金2025年第4季度报告'
const request = '知识执行E1：请在本机知识库检索“'+title+'”，只报告匹配条数和首条标题；如果没有匹配，请明确说明0条，不联网。'
const sessionFor = text => ({id:'knowledge-session',header:{},events:[
  {type:'turn/start',data:{turn:2}},
  {type:'user/message',seq:7,data:{id:'current-human',role:'user',source:{kind:'user',clientMode:'knowledge'},content:[{type:'text',text}]}}
]})
const tools = ['client_action','client_capabilities','web_search','web_fetch','bash','browser_use'].map(name => ({name,parameters:{type:'object', properties:{}}}))
const wireFor = text => routeModeTools({tools},clientModeTurn(sessionFor(text))).tools
const ids = text => wireFor(text).find(tool=>tool.name==='client_action')?.parameters.properties.capability.enum ?? []

it('exposes only a real local title search for the admitted request and keeps private terms out of the shared route', () => {
  for(const text of [request,'请搜索本机知识库中的“同事共享研究纪要”。','Find “Shared Files” in my local knowledge base.']) {
    expect(wireFor(text).map(tool=>tool.name)).toEqual(['client_action'])
    expect(ids(text)).toEqual(['knowledge.local.search'])
  }
  const offlineRead=wireFor('请在本地知识库搜索报告并读取正文，不联网。')
  expect(offlineRead.map(tool=>tool.name)).toEqual(['client_action'])
  expect(offlineRead[0].parameters.properties.capability.enum).toContain('knowledge.file.read')
  expect(offlineRead[0].parameters.properties.capability.enum).not.toContain('knowledge.shared.read')
  const turn = clientModeTurn(sessionFor(request))
  expect(modeProfilePrompt(turn)).toContain('limit=1')
  for(const name of ['web_fetch','bash','browser_use']) expect(disallowedModeTool(turn,name,{})).toBeTruthy()
  for(const capability of ['knowledge.filter','knowledge.shared.search','knowledge.file.organize'])
    expect(disallowedModeTool(turn,'client_action',{capability})).toBeTruthy()
  expect(ids('请查找同事共享的研究资料。')).toContain('knowledge.shared.search')
  expect(ids('请查找同事共享的研究资料。')).not.toContain('knowledge.local.search')
  expect(wireFor('请在知识库搜索同事共享的文件，不联网。')).toEqual([])
  expect(ids('如何在本机知识库搜索报告？')).not.toContain('knowledge.local.search')
  expect(ids('不用在知识库搜索报告。')).not.toContain('knowledge.local.search')
})

it('recovers a model final claim with no tool call once, and never reissues an attempted or cancelled search', () => {
  const stopping = {}
  registerConversationComponentsPolicy({systemPrompt:{context:()=>()=>{}},on:(id,callback)=>{stopping[id]=callback;return()=>{}}})
  const run = (call,aborted) => {
    const session = sessionFor(request), steer = vi.fn(), agent = {session,steer}
    if(call)session.events.push({type:'tool/call',data:{name:'client_action',arguments:JSON.stringify({capability:'knowledge.local.search'})}})
    session.events.push({type:'assistant/chunk',data:{chunk:{type:'finish',reason:{kind:'stop'}}}})
    const env = {agent,turn:2,signal:aborted?AbortSignal.abort():new AbortController().signal}
    stopping['agent/turn-stopping'](env)
    stopping['agent/turn-stopping'](env)
    return steer.mock.calls
  }
  expect(run(false,false)).toHaveLength(1)
  expect(run(true,false)).toHaveLength(0)
  expect(run(false,true)).toHaveLength(0)
})

it('runs the official tool through a visible host against a real account store; counts all titles and keeps the active filter untouched', async () => {
  const root = await mkdtemp(join(tmpdir(),'ework-knowledge-local-search-'))
  let owner='account-one'
  const store = new KnowledgeStore(join(root,'catalog'),()=>({owner,generation:1}),()=>{})
  const remote=vi.fn(()=>{throw Error('unexpected sharing request')}),view=vi.fn(()=>{throw Error('unexpected UI command')})
  const service = new ClientCapabilityService({owner:()=>owner,canRead:()=>true,canWrite:()=>false,scheduled:()=>false,
    knowledge:current=>knowledgeCapabilityHandlers(store,{received:remote},{},{run:view},current),
    send:()=>{},canvasAvailable:()=>false,canvas:async()=>{},window:async()=>{}})
  const registered=new Map(),calls=[]
  const dispose=registerClientTools({tools:{register:tool=>{registered.set(tool.name,tool);return()=>{}}}},{
    env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'test'},
    fetch:async(_url,init)=>{
      const body=JSON.parse(init.body);calls.push(body)
      return new Response(JSON.stringify(await service.request(body,init.signal)))
    }
  })
  const session=sessionFor(request), exec={agent:{session},signal:new AbortController().signal}
  const run=async(requestId,query,args={})=>JSON.parse(await registered.get('client_action').execute(
    {requestId,capability:'knowledge.local.search',arguments:{query,limit:1,...args}},exec))
  try{
    service.bind({sessionId:session.id,mode:'knowledge',active:true})
    expect(await run('empty',title)).toMatchObject({status:'succeeded',data:{scope:'local',count:0,documents:[],nextOffset:null}})
    const makeFile=async(name,value)=>{const path=join(root,name);await writeFile(path,value??name);return path}
    const matched=await store.importFile(await makeFile(title+'.pdf'))
    // A matching session title must not count as a matching document title.
    await store.collectGenerated(await makeFile('摘要.md'),{sessionId:'research',sessionTitle:title})
    for(let i=0;i<42;i++)await store.importFile(await makeFile('资料'+i+'.md'))
    const hit=await run('single',title)
    expect(hit.data).toEqual({scope:'local',count:1,documents:[{id:matched.id,name:title+'.pdf'}],nextOffset:null})
    expect(calls.at(-1)).toMatchObject({method:'execute',sessionId:session.id,authorityId:'current-human',expectedMode:'knowledge',sourceInstruction:request})
    const first=await run('many','资料')
    expect(first.data.count).toBe(42)
    expect(first.data.documents).toHaveLength(1)
    expect(first.data.nextOffset).toBe(1)
    expect((await run('next','资料',{offset:1})).data.documents).not.toEqual(first.data.documents)
    expect(calls).toHaveLength(4)
    expect(remote).not.toHaveBeenCalled();expect(view).not.toHaveBeenCalled()
    owner='account-two'
    await expect(run('changed',title)).rejects.toThrow('未绑定')
    service.bind({sessionId:session.id,mode:'knowledge',active:true})
    expect((await run('other-owner',title)).data.count).toBe(0)
  }finally{dispose();service.dispose();await rm(root,{recursive:true,force:true})}
})
