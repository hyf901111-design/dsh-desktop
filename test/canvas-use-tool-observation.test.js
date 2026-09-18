import {it,expect,vi,afterEach} from 'vitest'
import {registerCanvasUseTool} from '../packages/dsh-research-task-runtime/canvas-use-tools.js'
import {bindCanvasChild} from '../packages/dsh-research-task-runtime/canvas-tools.js'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
for(const failure of [false,true])it(failure?'does not claim verification when post-action observation fails':'returns fresh post-action evidence in the same tool result',async()=>{
 vi.stubEnv('SHERLOCK_RESEARCH_CONTEXT_URL','http://127.0.0.1:1234');vi.stubEnv('SHERLOCK_RESEARCH_CONTEXT_TOKEN','test')
 const calls=[],guard=vi.fn(),unbind=bindCanvasChild('child','parent',guard)
 vi.stubGlobal('fetch',async(_url,init)=>{const b=JSON.parse(init.body);calls.push(b);return new Response(JSON.stringify(b.args.op==='observe'?failure?{error:'离线'}:{revision:'new',fingerprint:'after',writable:true,surfaces:[{id:'n',elements:[{ref:'e1',image:'data:image/png;base64,YQ=='}]}]}:{status:'dispatched'}),{status:failure&&b.args.op==='observe'?400:200})})
 let tool;registerCanvasUseTool({tools:{register:t=>{tool=t;return()=>{}}}})
 try {
  const result=JSON.parse(await tool.execute({op:'click',args:JSON.stringify({nodeId:'n',revision:'old',surfaceRevision:'old',requestId:'once'})},{agent:{session:{id:'child'}},signal:new AbortController().signal}))
  expect(calls.map(c=>c.args.op)).toEqual(['click','observe']);expect(calls[1].args.nodeIds).toEqual(['n']);expect(calls[1].sessionId).toBe('parent')
  if(failure){expect(result.observationError).toContain('离线');expect(guard.mock.calls.map(c=>c[0])).toEqual(['use'])}
  else{expect(result.observation.revision).toBe('new');expect(guard.mock.calls.map(c=>c[0])).toEqual(['use','observed']);expect(result.observation.surfaces[0].elements[0].image).toBeUndefined()}
 }finally{unbind()}
})
