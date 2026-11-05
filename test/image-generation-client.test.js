import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {imageGenerationCalls,patchImageGenerationClient,IMAGE_GENERATION_CSS} from '../scripts/lib/image-generation-client.mjs'
const image={attachmentId:'generated',mediaType:'image/png',bytes:10,width:1536,height:1024}
const node=root=>({kind:'tool-call',data:{root}})
const pending={name:'image_generate',callId:'one',argsRaw:'{"size":"1536x1024"}',subCalls:[]}
const done={kind:'tool-result',call:{name:'image_generate',argsRaw:pending.argsRaw},callId:'one',subCalls:[],content:[{type:'text',text:JSON.stringify({kind:'odyssey-image-generation',ok:true,model:'gpt-image-2.6-flare',image})},{type:'image',attachment:image}]}
it('renders live image generation outside folded tool details and settles in the same keyed card',()=>{
 expect(imageGenerationCalls([node(pending)],true)).toMatchObject([{id:'one',state:'running',ratio:'3 / 2'}])
 expect(imageGenerationCalls([node(done)],true)).toMatchObject([{id:'one',state:'completed',image}])
})
it('does not animate cancelled, failed or historical interrupted calls',()=>{
 expect(imageGenerationCalls([node(pending)],false)[0].state).toBe('interrupted')
 expect(imageGenerationCalls([node({...done,isError:true,content:[]})],true)[0].state).toBe('failed')
 expect(imageGenerationCalls([node({...done,isError:true,error:{code:'interrupted'},content:[]})],true)[0].state).toBe('cancelled')
})
it('finds nested code-mode calls, deduplicates by call ID and rejects fake success without an image block',()=>{
 expect(imageGenerationCalls([node({...pending,name:'exec',subCalls:[done]}),node(done)],true)).toHaveLength(1)
 expect(imageGenerationCalls([node({...done,content:done.content.slice(0,1)})],false)[0].state).toBe('failed')
 expect(imageGenerationCalls([node({...pending,name:'bash'})],true)).toEqual([])
})
it('patches the actual conversation bundle idempotently and keeps ordinary image output',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchImageGenerationClient(source)
 expect(patchImageGenerationClient(patched)).toBe(patched)
 expect(patched).toContain('running: entry.running')
 expect(patched).toContain('function ToolImageOutputs(')
 expect(patched).toContain('odyssey-image-generation')
 expect(IMAGE_GENERATION_CSS).toContain('prefers-reduced-motion:reduce')
 expect(IMAGE_GENERATION_CSS).toContain('[data-state=running]')
 expect(IMAGE_GENERATION_CSS).toContain('@keyframes')
})
