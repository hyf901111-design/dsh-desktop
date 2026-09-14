import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'
import { patchBoardDirectoryWorkspace } from '../scripts/lib/board-directory-picker.mjs'
const require=createRequire(import.meta.url)
const source=patchFigmaFinalCanvas(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const start=source.indexOf('function ResearchDerivedHeading('),end=source.indexOf('\n}',start)+2
const heading=new Function('react_jsx_runtime','researchDerivedTitle','RESEARCH_MIND_MAP_DETAIL_OPTIONS','researchMindMapDetail',source.slice(start,end)+';return ResearchDerivedHeading')(require('react/jsx-runtime'),(n:any)=>n.title,[{value:'brief',label:'简要'}],(x:any)=>x)
it.each(['queued','running','completed','failed','cancelled'])('omits %s state text from the component header',generationStatus=>{
 expect(heading({node:{kind:'generated-summary',title:'总结',generationStatus}}).props.children[1]).toBeNull()
})
it('retains the mindmap detail level',()=>{
 expect(heading({node:{kind:'generated-mind-map',title:'思维导图',generationStatus:'completed',generationDetail:'brief'}}).props.children[1].props.children).toBe('简要')
})
it('keeps directory selection after search when reapplying patches',()=>{
 const workspace=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8')
 expect(patchBoardDirectoryWorkspace(workspace)).toBe(workspace)
 expect(workspace).toContain("items.splice(items.findIndex(item=>item.id==='workspace-search')+1,0,{id:'::board-directory'")
})
it('keeps canvas patch repeatable',()=>expect(patchFigmaFinalCanvas(source)).toBe(source))
