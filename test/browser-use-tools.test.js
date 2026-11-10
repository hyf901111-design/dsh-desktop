import {expect,it} from 'vitest'
import {registerBrowserUseTool} from '../packages/dsh-research-task-runtime/browser-use-tools.js'
const env={SHERLOCK_LOCAL_SEARCH_URL:'http://127.0.0.1:12345',SHERLOCK_LOCAL_SEARCH_TOKEN:'fixture-token'}
const exec={agent:{session:{id:'current-conversation'}}}
const edit={op:'edit',tabId:'active-tab',url:'https://example.test/article',revision:'current-revision',documentRevision:'current-revision',patches:[{ref:'t1',expectedText:'Research',replacementText:'研究'}]}
function setup(options={}){let tool;const calls=[];registerBrowserUseTool({tools:{register:value=>{tool=value;return()=>{}}}},{env,request:async(url,init)=>{calls.push({url,...init,body:JSON.parse(init.body)});return new Response(JSON.stringify({observation:{canUndo:true},edit:{changed:1,localOnly:true}}))},...options});return{tool,calls}}
it('sends a finite text patch to the trusted bridge under the executing conversation',async()=>{
 const {tool,calls}=setup(),result=JSON.parse(await tool.execute(edit,exec))
 expect(result.edit).toEqual({changed:1,localOnly:true});expect(calls[0].url).toBe('http://127.0.0.1:12345/browser');expect(calls[0].body).toEqual({...edit,sessionId:'current-conversation'});expect(calls[0].headers.authorization).toBe('Bearer fixture-token');expect(calls[0].redirect).toBe('error')
 await tool.execute({op:'undo',tabId:edit.tabId,url:edit.url,revision:edit.revision},exec);expect(calls[1].body.op).toBe('undo')
})
it('rejects scripts, attribute mutations and forged conversation identities before the bridge',async()=>{
 const {tool,calls}=setup()
 for(const input of [{op:'evaluate',code:'alert(1)'},{...edit,sessionId:'another'},{...edit,patches:[{...edit.patches[0],attribute:'href'}]},{...edit,patches:[{...edit.patches[0],html:'<script>anything</script>'}]}])await expect(tool.execute(input,exec)).rejects.toThrow()
 expect(calls).toHaveLength(0)
})
it('does not dispatch cancelled or unauthenticated operations or follow an external bridge',async()=>{
 const {tool,calls}=setup(),cancel=new AbortController();cancel.abort()
 await expect(tool.execute(edit,{...exec,signal:cancel.signal})).rejects.toThrow();await expect(tool.execute(edit,{})).rejects.toThrow();expect(calls).toHaveLength(0)
 const foreign=setup({env:{...env,SHERLOCK_LOCAL_SEARCH_URL:'https://example.test'}});await expect(foreign.tool.execute(edit,exec)).rejects.toThrow();expect(foreign.calls).toHaveLength(0)
})

it('exposes native reload recovery and forwards recovery acknowledgements without requiring a DOM observation',async()=>{
 const {tool}=setup({request:async(url,init)=>new Response(JSON.stringify({reloading:true,tabId:'active-tab'}))});const result=JSON.parse(await tool.execute({op:'reload',tabId:'active-tab',url:'https://example.test/article'},exec));expect(result.reloading).toBe(true)
})

it('rejects edit batches over 100 nodes before contacting the page bridge',async()=>{
 const {tool,calls}=setup();await expect(tool.execute({...edit,patches:Array.from({length:101},()=>({...edit.patches[0]}))},exec)).rejects.toThrow(/100/);expect(calls).toHaveLength(0)
})
