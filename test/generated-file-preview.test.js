import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {patchGeneratedFileMentions,patchGeneratedFilePreview} from '../scripts/lib/generated-file-preview.mjs'
import {patchInspectConversation} from '../scripts/lib/inspect-sidebar.mjs'
it('makes generated document names actionable without inventing an absolute path',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js','utf8')
 const out=patchGeneratedFileMentions(source)
 const start=out.indexOf('const known=producedFileMentions'),end=out.indexOf('\n\t\t\t} });',start)
 const opened=[]
 const resolver=runInNewContext('(function(){'+out.slice(start,end)+'})()', {producedFileMentions:()=>({resolve:()=>undefined}),paths:[],owner:{cwd:'/workspace',openFile:p=>opened.push(p)},t:(_k,v)=>'Open '+v.name})
 resolver.resolve('人类命运共同体介绍.pptx').open()
 expect(opened).toEqual(['人类命运共同体介绍.pptx'])
 expect(resolver.resolve('count.value')).toBeUndefined()
 expect(patchGeneratedFileMentions(out)).toBe(out)
})
it('opens a scope-bound lookup tab and retains separate file choices',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const out=patchGeneratedFilePreview(patchInspectConversation(source))
 expect(patchGeneratedFilePreview(out)).toBe(out)
 expect(out).toContain("files.length===1&&!value.truncated")
 expect(out).toContain("coordinator.service.closeTab?.(tab.id,scope)")
 new Function(out)
})
