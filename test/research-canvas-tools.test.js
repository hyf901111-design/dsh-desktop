import { it, expect } from 'vitest'
import { registerCanvasTools, bindCanvasChild } from '../packages/dsh-research-task-runtime/canvas-tools.js'
it('derives board identity from execution and rejects model-supplied session IDs',async()=>{
 const tools=new Map(),calls=[]
 const dispose=registerCanvasTools({tools:{register:t=>{tools.set(t.name,t);return()=>tools.delete(t.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'secret'},fetch:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({revision:'r',nodes:[]}))}})
 const tool=tools.get('research_canvas_inspect'),exec={agent:{session:{id:'session'}},signal:new AbortController().signal}
 await tool.execute({},exec);expect(calls[0].sessionId).toBe('session')
 await expect(tool.execute({sessionId:'other'},exec)).rejects.toThrow()
 const release=bindCanvasChild('child','parent');await tool.execute({},{...exec,agent:{session:{id:'child'}}});expect(calls[1].sessionId).toBe('parent');release();dispose();expect(tools.size).toBe(0)
})
it('exposes schema-valid tool outputs',async()=>{
 const {validateJsonSchemaValue}=await import('@deepseek-ai/dsh-tools')
 const registered=[]
 const dispose=registerCanvasTools({tools:{register:t=>{registered.push(t);return()=>{}}}})
 for(const tool of registered)expect(validateJsonSchemaValue(tool.output.schema,'{"status":"applied"}')).toEqual([])
 dispose()
})
