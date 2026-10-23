import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'
import {expect,it} from 'vitest'
import {patchHomeGuidePresentationNative,patchHomeGuidePresentationOffice,stripHomeGuidePresentationOffice} from '../scripts/lib/home-guide-presentation-native.mjs'
import {patchSherlockOfficePreviewClient,patchSherlockOfficePreviewPackage} from '../scripts/lib/patch-sherlock-office-preview.mjs'
import {patchPptxEditor} from '../scripts/lib/pptx-editor-ui.mjs'
import {patchPptxResize,stripPptxResizePatch} from '../scripts/lib/pptx-resize-settle.mjs'
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
it('adds a private native portal and binds real sidebar/Office services without remounting the native root',()=>{
 const patched=patchHomeGuidePresentationNative(source)
 expect(patchHomeGuidePresentationNative(patched)).toBe(patched);expect(()=>new Script(patched)).not.toThrow()
 expect(patched).toContain('function NativePresentationConversationRoot(')
 expect(patched).toContain('new SessionInputShell(')
 expect(patched).toContain('react.createElement(InputBar,')
 expect(patched).toContain('react.createElement(TodoPanel,')
 expect(patched).toContain('researchOfficePreview')
 expect(patched).toContain('service.registerTab(')
 expect(patched).toContain('service.closeTab(ticket.tabId,')
 const injected=patched.slice(patched.indexOf('/* odyssey:home-guide-presentation:start:v1 */'),patched.indexOf('/* odyssey:home-guide-presentation:end:v1 */'))
 expect(injected.includes('sessions.create(')).toBe(false)
})
it('fails closed on drift and remains composable with the separate board guide wrapper',async()=>{
 expect(()=>patchHomeGuidePresentationNative('function ConversationRoot(){}')).toThrow(/anchor/)
 const {patchHomeGuideNative}=await import('../scripts/lib/home-guide-native.mjs')
 const patched=patchHomeGuidePresentationNative(patchHomeGuideNative(source))
 expect(()=>new Script(patched)).not.toThrow();expect(patchHomeGuidePresentationNative(patched)).toBe(patched)
 const refresh=patchHomeGuidePresentationNative(patchHomeGuideNative(patched))
 expect(refresh===patched).toBe(true)
})
it('upgrades an installed Office package and keeps its readonly branch idempotent through fingerprint validation',async()=>{
 const raw=readFileSync('/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8')
 const standard=patchPptxEditor(patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(stripHomeGuidePresentationOffice(raw)))))
 const readonly=patchHomeGuidePresentationOffice(standard)
 expect(patchHomeGuidePresentationOffice(readonly)===readonly).toBe(true)
 expect(stripHomeGuidePresentationOffice(readonly)===standard).toBe(true)
 expect(readonly.includes('props?.readOnly === true ? PptxPreview : PptxView')).toBe(true)
 expect(()=>new Script(readonly)).not.toThrow()
 const temp=await mkdtemp(join(tmpdir(),'presentation-office-'))
 try{
  await mkdir(join(temp,'lib'));await writeFile(join(temp,'package.json'),JSON.stringify({name:'@huanlin/dsh-plugin-better-sidebar-plugin-office',version:'0.1.0'}));await writeFile(join(temp,'lib/client.js'),standard)
  await patchSherlockOfficePreviewPackage(temp);const first=await readFile(join(temp,'lib/client.js'),'utf8')
  expect(first===readonly).toBe(true)
  await patchSherlockOfficePreviewPackage(temp);expect((await readFile(join(temp,'lib/client.js'),'utf8'))===first).toBe(true)
 }finally{await rm(temp,{recursive:true,force:true})}
})
