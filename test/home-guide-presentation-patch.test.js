import {readFileSync} from 'node:fs'
import {Script,runInNewContext} from 'node:vm'
import {createRequire} from 'node:module'
import {Window} from 'happy-dom'
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
it('strictly strips the installed PPT wrapper before legacy passes and reconstructs the same native Root',async()=>{
 const {stripHomeGuidePresentationNative:strip}=await import('../scripts/lib/home-guide-presentation-native.mjs')
 expect(typeof strip).toBe('function')
 const {patchHomeGuideNative}=await import('../scripts/lib/home-guide-native.mjs')
 const pristine=strip(source),board=patchHomeGuideNative(pristine),patched=patchHomeGuidePresentationNative(board)
 expect(strip(patched)===board).toBe(true)
 expect(strip(strip(patched))===board).toBe(true)
 expect(patchHomeGuidePresentationNative(strip(patched))===patched).toBe(true)
 expect(strip('function ConversationRoot(){}')).toBe('function ConversationRoot(){}')
 for(const partial of [patched.replace('/* odyssey:home-guide-presentation:start:v1 */',''),patched.replace('/* odyssey:home-guide-presentation:end:v1 */',''),patched.replace('exports.NativeHomePresentationPortal = NativeHomePresentationPortal;',''),patched.replace('/* odyssey:home-presentation-binding:v1 */',''),patched.replace('ConversationRoot=NativePresentationConversationRoot;',''),patched+'\nconst invalidReference=HomePresentationNativeDeps;'])expect(()=>strip(partial)).toThrow(/strip.*drifted/)
 const require=createRequire(import.meta.url),win=new Window(),fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const load=text=>{
  let descriptor;win.__ModuleLoader__={load:value=>descriptor=value}
  runInNewContext(text,{window:win,document:win.document,navigator:win.navigator,localStorage:win.localStorage,CSS:win.CSS,DOMParser:win.DOMParser,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),structuredClone,AbortController,TextDecoder,TextEncoder,crypto,setTimeout,clearTimeout,setInterval,clearInterval,console})
  return descriptor.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):fake)
 }
 try{
  const original=load(strip(patched));expect(original.ConversationRoot.name).toBe('ConversationRoot');expect(original.NativeHomePresentationPortal).toBeUndefined()
  const native=load(patched.replace('exports.ConversationRoot = ConversationRoot;','exports.__original=HomePresentationOriginalConversationRoot;\nexports.ConversationRoot = ConversationRoot;'))
  const tree=native.ConversationRoot({sessionId:'fixture-native'})
  expect(tree.props.children[0].type).toBe(native.__original)
  expect(tree.props.children[0].props.sessionId).toBe('fixture-native')
  expect(tree.props.children[1].type).toBe(native.NativeHomePresentationPortal)
 }finally{await win.happyDOM.close()}
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
