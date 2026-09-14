import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { patchFigmaFilePreview } from '../scripts/lib/figma-file-preview-client.mjs'
const require = createRequire(import.meta.url)
it('mounts the packaged frame menu without using source state before initialization', () => {
 const source=patchFigmaFilePreview(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 expect(patchFigmaFilePreview(source)).toBe(source)
 const start=source.indexOf('function ResearchCanvasFrameMenu('),end=source.indexOf('function ResearchCanvasRichNodeFrame(',start)
 const react={useRef:()=>({current:null}),useState:value=>[value,()=>{}],useId:()=> 'menu',useEffect:()=>{},useLayoutEffect:()=>{}}
 const menu=new Function('react','react_jsx_runtime','researchCanvasArtifactContentEditable',source.slice(start,end)+';return ResearchCanvasFrameMenu')(react,require('react/jsx-runtime'),()=>false)
 expect(()=>menu({node:{id:'summary',kind:'generated-summary',title:'Summary'},onAction:()=>{}})).not.toThrow()
})
