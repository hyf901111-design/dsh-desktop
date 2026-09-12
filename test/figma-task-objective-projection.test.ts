import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { patchFigmaReadingConversation } from '../scripts/lib/figma-reading-client.mjs'
const source=patchFigmaReadingConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const requireModule=createRequire(import.meta.url)
const fallback:any=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback,construct:()=>({})})
let descriptor:any
runInNewContext(source,{AbortController,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout,document:undefined,window:{__ModuleLoader__:{load:(value:any)=>{descriptor=value}}}})
const client=descriptor.factory((id:string)=>['react','react/jsx-runtime','react-dom'].includes(id)?requireModule(id):fallback)
function fn(name:string){const a=source.indexOf(`\t\tfunction ${name}(`),b=source.indexOf('\n\t\t}',a);return source.slice(a,b+5)}
const start=source.indexOf('function odysseyTaskVisibleText('),end=source.indexOf('function OdysseyTaskStatus(',start)
const project=runInNewContext(['projectChatFileText','projectUserText','projectResearchUserText','researchPromptBasename','researchArtifactReferenceLabel','contentParts'].map(fn).join('\n')+'\n'+source.slice(start,end)+';odysseyTaskObjective',{
 react_jsx_runtime:requireModule('react/jsx-runtime'),parseResearchPrompt:client.parseResearchPrompt,
 RESEARCH_PROMPT_PREFIX:'␞SHERLOCK_RESEARCH_FILES_V1 ',ResearchMessageFileChip:function FileChip(){},ResearchMessageArtifactChip:function ArtifactChip(){},MessageItem_module_css_default:{refChip:'reference'}
})
function summary(text:string){return project({hasMore:false,chat:{order:['first'],nodes:new Map([['first',{kind:'user',data:{content:[{type:'text',text}]}}]])}})}
it('summarizes real Chat inline file syntax as its visible basename including escaped backticks',()=>{
 expect(summary('请总结 📎 文件：`/private/example/confidential/budget.xlsx`')).toBe('请总结 budget.xlsx')
 expect(summary('检查 📎 文件：`C:\\confidential\\budget.xlsx` 与 📎 文件：`/private/a\\`b.txt`')).toBe('检查 budget.xlsx 与 a`b.txt')
})
it('uses the actual Research codec and bubble projection for inline files and components',()=>{
 const files=[{id:'file-1',name:'budget.xlsx',path:'/private/confidential/budget.xlsx'}]
 const artifacts=[{id:'chart-1',kind:'assistant-result',title:'季度收入图',excerpt:'PRIVATE_HIDDEN_EXCERPT',messageId:'private-message'}]
 const inline=client.serializeResearchPrompt(files,'比较 与 ',[{fileId:'file-1',offset:3}],artifacts,[{artifactId:'chart-1',offset:5}])
 expect(summary(inline)).toBe('比较 budget.xlsx与 季度收入图')
 const legacy=client.serializeResearchPrompt(files,'请总结',[],artifacts,[])
 const label=summary(legacy)
 expect(label).toContain('budget.xlsx')
 expect(label).toContain('季度收入图')
 expect(label).toContain('请总结')
 for(const forbidden of ['/private','PRIVATE_HIDDEN_EXCERPT','SHERLOCK_RESEARCH_FILES_V1','file-1','chart-1'])expect(label).not.toContain(forbidden)
})
it('omits automatic canvas context and malformed serialization while leaving the stored request intact',()=>{
 const context={version:1,snapshotId:'private-snapshot',totalSources:1,initialSourceIds:['private-source'],initialContext:'PRIVATE_CANVAS_CONTEXT'}
 const text=client.serializeResearchPrompt([],'我的真实需求',[],[],[],context),original=String(text)
 expect(summary(text)).toBe('我的真实需求')
 expect(summary(client.serializeResearchPrompt([],'',[],[],[],context))).toBeUndefined()
 expect(summary('␞SHERLOCK_RESEARCH_FILES_V1 {"files": "/private/broken"')).toBeUndefined()
 expect(text).toBe(original)
})
