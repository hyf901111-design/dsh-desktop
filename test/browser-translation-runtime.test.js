import {EventEmitter} from 'node:events'
import {expect,it} from 'vitest'
import {translateBrowserBatch,registerBrowserTranslation} from '../packages/dsh-research-task-runtime/browser-translation.js'

const input={target:'zh-CN',selection:{provider:'chosen',model:'chosen-model',reasoningEffort:'high'},items:[{id:'a',text:'Hello'},{id:'b',text:'World'}]}
function fixture(answer={items:[{id:'b',text:'世界'},{id:'a',text:'你好'}]},kind='stop'){
 const calls=[];let handler
 const ctx={agentDefaultModel:{currentSelection:()=>({provider:'default',model:'default-model'})},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{routable:true,current:{provider:'session',model:'session-model'}}}})}},llm:{listProviders:()=>[{id:'chosen'},{id:'default'},{id:'session'}],resolveModelInfo:async(provider,id)=>({provider,id,name:id,inputModalities:['text'],reasoning:{efforts:[{id:'low'},{id:'high'}]}}),stream:async function*(options){calls.push(options);yield {type:'text-delta',text:typeof answer==='string'?answer:JSON.stringify(answer)};yield {type:'finish',reason:{kind}}}},webServer:{register:route=>{handler=route.handler;return()=>{}}}}
 return{ctx,calls,handler:()=>handler}
}
it('uses explicit pending model with supported fast reasoning and no chat/tools',async()=>{
 const f=fixture();expect(await translateBrowserBatch(f.ctx,input)).toEqual({items:[{id:'a',text:'你好'},{id:'b',text:'世界'}]})
 expect(f.calls[0]).toMatchObject({provider:'chosen',model:'chosen-model',reasoningEffort:'low',tools:[]});expect(f.calls[0].sessionId).toBeUndefined()
 expect(f.calls[0].system).toContain('数据');expect(f.calls[0].messages).toHaveLength(1)
})
it('uses existing session route only when explicit selection is absent',async()=>{
 const f=fixture();await translateBrowserBatch(f.ctx,{target:'zh-CN',sessionId:'existing',items:input.items});expect(f.calls[0].provider).toBe('session')
})
it('validates exact route without requiring advisory catalog membership',async()=>{
 const f=fixture();f.ctx.llm.listModels=()=>{throw Error('advisory catalog must not gate dispatch')};await translateBrowserBatch(f.ctx,input)
 f.ctx.llm.resolveModelInfo=async()=>{throw Error('not configured')};await expect(translateBrowserBatch(f.ctx,input)).rejects.toThrow();expect(f.calls).toHaveLength(1)
})
it('rejects missing, duplicate, unknown IDs, empty text and non-stop output',async()=>{
 for(const answer of [{items:[{id:'a',text:'你好'}]},{items:[{id:'a',text:'你好'},{id:'a',text:'世界'}]},{items:[{id:'a',text:'你好'},{id:'c',text:'世界'}]},{items:[{id:'a',text:''},{id:'b',text:'世界'}]},'```json\n{}\n```'])await expect(translateBrowserBatch(fixture(answer).ctx,input)).rejects.toThrow()
 await expect(translateBrowserBatch(fixture(undefined,'max-tokens').ctx,input)).rejects.toThrow()
 await expect(translateBrowserBatch(fixture().ctx,{...input,selection:{...input.selection,apiKey:'forbidden'}})).rejects.toThrow()
})
it('aborts an uncooperative stream without waiting on generator return',async()=>{
 const f=fixture(),controller=new AbortController();f.ctx.llm.stream=()=>({[Symbol.asyncIterator](){return this},next:()=>new Promise(()=>{}),return:()=>new Promise(()=>{})})
 const pending=translateBrowserBatch(f.ctx,input,controller.signal);controller.abort();await expect(pending).rejects.toThrow()
})
it('rejects tool calls before waiting for more tool stream content',async()=>{
 const f=fixture();f.ctx.llm.stream=async function*(){yield{type:'tool-call-start',id:'tool',name:'shell'};await new Promise(()=>{})}
 await expect(translateBrowserBatch(f.ctx,input)).rejects.toThrow(/文字/)
})
it('rejects untrusted requests before reading text and cancels on response close',async()=>{
 const rejected=fixture();let code;const undo=registerBrowserTranslation(rejected.ctx,{isTrustedRequest:()=>false}),untrusted=Object.assign(new EventEmitter(),{method:'POST'})
 await rejected.handler()(untrusted,{writeHead:status=>{code=status},end(){}});expect(code).toBe(403);expect(untrusted.listenerCount('data')).toBe(0);expect(rejected.calls).toHaveLength(0);undo()
 const f=fixture();let signal;f.ctx.llm.stream=options=>{signal=options.signal;return{[Symbol.asyncIterator](){return this},next:()=>new Promise(()=>{}),return:async()=>({done:true})}}
 const dispose=registerBrowserTranslation(f.ctx,{isTrustedRequest:()=>true});const req=Object.assign(new EventEmitter(),{method:'POST'}),res=Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,writeHead(){},end(){this.writableEnded=true}})
 const pending=f.handler()(req,res);req.emit('data',Buffer.from(JSON.stringify(input)));req.emit('end');await new Promise(resolve=>setTimeout(resolve,0));res.emit('close');await pending;expect(signal.aborted).toBe(true);dispose()
})
