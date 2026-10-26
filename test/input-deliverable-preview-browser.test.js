import {readFileSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchComposerDeliverablePreview} from '../scripts/lib/figma-composer-deliverable-preview.mjs'

let browser,runtime
let nativeSource=patchComposerDeliverablePreview(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const runtimeSource=readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
nativeSource=nativeSource.replace('\t\texports.apply = apply;','\t\texports.apply = apply;\nexports.__testInputBar = InputBar;')
const evidence='/tmp/skill-cover-close-20261026/browser'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import {createPptxAnnotationShellBinding} from './scripts/lib/pptx-annotation-input.mjs';import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
 const empty=()=>null;
 const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty});
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty}:fake;
 const clientRuntime=window.__nativeDescriptors[0].factory(modules);
 const native=window.__nativeDescriptors[1].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?clientRuntime:modules(id));
 const shell=new native.SessionInputShell({actx:{},defaultSink:()=>{window.submissions++}});
 window.submissions=0;
 let phase='plain';const label={ppt:'efund-ppt-maker',report:'ework-equity-research'};
 const props={useSession:select=>select({running:false,promptError:null,subagent:null,removed:false}),
  useInput:select=>{const snapshot=React.useSyncExternalStore(shell.state.subscribe,()=>shell.snapshot,()=>shell.snapshot);return select(phase==='plain'?snapshot:{...snapshot,phase})},
  inputActions:shell.actions,keyboard:shell,renderSlot:()=>null,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:(_key,select)=>select?.(undefined),sessionId:'native-preview',draftImages:ids=>ids.map(id=>({id,file:{name:'保留图片.png'}})),t:key=>key,variant:'hero'};
 const root=createRoot(document.querySelector('#fixture'));root.render(React.createElement(native.__testInputBar,props));
 window.previewFixture={shell,force(options){Object.assign(props,options);root.render(React.createElement(native.__testInputBar,props));return new Promise(resolve=>requestAnimationFrame(()=>resolve()))},phase(value){phase=value;root.render(React.createElement(native.__testInputBar,props));return new Promise(resolve=>requestAnimationFrame(()=>resolve()))},bindAnnotation(){const binding=createPptxAnnotationShellBinding(shell,{getSelection:()=>{const el=document.querySelector('textarea');return{start:el.selectionStart,end:el.selectionEnd}}});window[Symbol.for('sherlock:pptx-annotation-input')]={getShellBinding:keyboard=>keyboard===shell?binding:undefined};const ref={source:'pptx-annotation',ref:JSON.stringify({version:1,sessionId:'native-preview',documentId:'a'.repeat(64),fileVersion:'b'.repeat(64),markId:'keep'}),label:'标注 1',clipboardText:'标注 1'};binding.insert(ref,'保留的标注意见👩🏽‍💻\\n第二行');this.binding=binding},dispose:()=>root.unmount(),
  add(kind,source='ework-managed-skill',id){const name=label[kind];return shell.insertReference({source,ref:JSON.stringify({id:id??'builtin:'+name,revision:1,invocationName:'ework-skill-0123456789abcdef',label:name}),label:'/'+name,clipboardText:'/'+name},{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev})},
  text(value){shell.setDraft(value,{start:0,end:shell.snapshot.draft.length,insertedLength:value.length})},
  append(value){shell.insertText(value,{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev})},
  removeLast(){const occurrence=shell.snapshot.occurrences.at(-1);if(occurrence)shell.setDraft(shell.snapshot.draft.slice(0,occurrence.offset)+shell.snapshot.draft.slice(occurrence.offset+1),{start:occurrence.offset,end:occurrence.offset+1,insertedLength:0})}
 };
 `},bundle:true,write:false,format:'iife',platform:'browser'});runtime=result.outputFiles[0].text
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture({width=780,dark=false,mode='home'}={}){
 const page=await browser.newPage({viewport:{width:Math.max(860,width+40),height:800},deviceScaleFactor:2})
 const errors=[];page.on('pageerror',error=>{errors.push(error.stack||error.message);console.error(error.stack||error.message)})
 // Reading seats retain their existing 16px native clearance on both sides.
 await page.setContent(`<body ${dark?'data-ds-dark-theme':''}><div class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="${mode}"><main id="fixture" data-center-composer-host style="width:${width+(mode==='conversation'?32:0)}px"></main></div></div></body>`)
 await page.evaluate(()=>{window.__nativeDescriptors=[];window.__ModuleLoader__={load:descriptor=>window.__nativeDescriptors.push(descriptor)}})
 await page.addScriptTag({content:runtimeSource})
 await page.addScriptTag({content:nativeSource})
 // Preserve the production cascade order from shell-style.ts, including the
 // reading overrides that come after inline-reference/deliverable styles.
 const styles=['figma-final-shell.css','figma-home.css','figma-panels.css','figma-file-panel.css','figma-trajectory.css','figma-inline-references.css','figma-motion.css','figma-refinements.css','figma-reading.css','figma-welcome.css','focus-style.css','client-typography.css'].map(name=>readFileSync('src/preload/'+name,'utf8')).join('\n')
 await page.addStyleTag({content:styles+'\nbody{margin:20px;--dsh-composer-side-clearance:0;--dsh-composer-card-max-width:780px;--dsw-font-family:system-ui;--odyssey-font-ui:system-ui;--odyssey-home-input:rgba(255,255,255,.5);--dsw-alias-label-primary:#252525}body[data-ds-dark-theme]{--odyssey-home-input:rgba(0,0,0,.49);--dsw-alias-label-primary:#e5e5e5}.wSkVaW_root{display:block;height:auto}.uV2eYG_root{width:100%}#fixture{margin:0}'});
 await page.addScriptTag({content:runtime})
 await page.waitForSelector('textarea',{timeout:3000}).catch(error=>{throw Error(errors.join('\n')||error.message)})
 return page
}

it('shows a decorative delivery preview from a real native skill occurrence without sending or replacing the input',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>{window.savedInput=document.querySelector('textarea');window.previewFixture.add('ppt')})
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-preview="ppt"]').count()).toBe(1)
  expect(await page.locator('[data-odyssey-deliverable-art="ppt"]').count()).toBe(1)
  expect(await page.evaluate(()=>window.savedInput===document.querySelector('textarea'))).toBe(true)
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)

it('runs the real installed InputBar after the complete dependency pipeline without missing preview definitions',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>window.previewFixture.add('ppt'))
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-art="ppt"]').count()).toBe(1)
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)

it.each([{kind:'ppt',dark:false},{kind:'ppt',dark:true},{kind:'report',dark:false},{kind:'report',dark:true},{kind:'ppt',dark:true,mode:'conversation'},{kind:'report',dark:false,mode:'conversation'}])('matches the accepted native input layout and real assets ($kind dark=$dark mode=$mode)',async({kind,dark,mode})=>{
 const page=await fixture({dark,mode})
 try{
  await page.evaluate(kind=>{window.previewFixture.add(kind);window.previewFixture.append('请围绕研究主题填写需求。\n先核对资料，再交付可编辑文件。')},kind)
  await page.waitForSelector('[data-odyssey-deliverable-art]')
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-odyssey-deliverable-art] img')].every(image=>image.complete&&image.naturalWidth>0))
  const geometry=await page.evaluate(()=>{
   const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}}
   const card=document.querySelector('[data-composer-card]'),art=document.querySelector('[data-odyssey-deliverable-art]'),board=art.firstElementChild,cover=board.firstElementChild;
   return{card:rect(card),surface:getComputedStyle(card).backgroundColor,blur:getComputedStyle(card).backdropFilter,art:rect(art),board:rect(board),cover:{width:parseFloat(getComputedStyle(cover).width),height:parseFloat(getComputedStyle(cover).height)},row:rect(document.querySelector('.uV2eYG_row')),
    layers:['textarea','[data-input-backdrop]','[data-input-mirror]'].map(selector=>{const element=document.querySelector(selector),style=getComputedStyle(element);return{...rect(element),left:style.paddingLeft,right:style.paddingRight,top:style.paddingTop,bottom:style.paddingBottom,font:style.fontSize,lineHeight:style.lineHeight}}),
    hidden:board.getAttribute('aria-hidden'),interactive:getComputedStyle(art).pointerEvents,images:[...art.querySelectorAll('.odyssey-deliverable-cover img')].map(image=>({width:image.naturalWidth,height:image.naturalHeight,src:image.src.slice(0,22)}))}
  })
  expect(geometry.card.width).toBeCloseTo(780,1);expect(geometry.card.height).toBeCloseTo(199,1)
  expect(geometry.surface).toBe(dark?'rgba(0, 0, 0, 0.49)':'rgba(255, 255, 255, 0.5)');expect(geometry.blur).toBe('blur(12px)')
  expect(geometry.board.y-geometry.card.y).toBeCloseTo(23,1)
  expect(geometry.art.width).toBeCloseTo(128,1);expect(geometry.art.height).toBeCloseTo(128,1)
  expect(geometry.row.height).toBeCloseTo(48,1)
  for(const layer of geometry.layers){expect(layer.left).toBe('165px');expect(layer.right).toBe('17px');expect(layer.top).toBe('15px');expect(layer.bottom).toBe('8px');expect(layer.font).toBe('16px');expect(layer.lineHeight).toBe('24px')}
  expect(geometry.cover.width).toBeCloseTo(kind==='ppt'?116:80,2);expect(Math.abs(geometry.cover.height-(kind==='ppt'?65.25:107.273))).toBeLessThan(.02)
  expect(geometry.hidden).toBe('true');expect(geometry.interactive).toBe('none')
  expect(geometry.images.map(image=>[image.width,image.height])).toEqual([[1206,676],[456,99]])
  expect(geometry.images.every(image=>image.src.startsWith('data:image/png;base64,'))).toBe(true)
  await page.locator('[data-composer-card]').screenshot({path:evidence+'/'+kind+'-'+(dark?'dark':'light')+'.png'})
 }finally{await page.close()}
},15000)

it('uses the last actual target reference, and native deletion restores text layout without replacing or blurring the textarea',async()=>{
 const page=await fixture({mode:'conversation'})
 try{
  await page.evaluate(()=>{window.previewFixture.add('ppt');window.previewFixture.add('report');window.previewFixture.append('保留的正文');window.savedInput=document.querySelector('textarea')})
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-art="report"]').count()).toBe(1)
  await page.evaluate(()=>window.previewFixture.removeLast())
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-art="ppt"]').count()).toBe(1)
  await page.locator('textarea').focus()
  await page.locator('textarea').evaluate(input=>input.setSelectionRange(1,1))
  await page.locator('textarea').press('Backspace')
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-art]').count()).toBe(0)
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toContain('保留的正文')
  expect(await page.evaluate(()=>window.savedInput===document.querySelector('textarea')&&document.activeElement===window.savedInput)).toBe(true)
  expect(await page.locator('textarea').evaluate(input=>input.selectionStart)).toBe(0)
  expect(await page.locator('textarea').evaluate(input=>getComputedStyle(input).paddingLeft)).toBe('17px')
  expect(await page.locator('[data-composer-card]').evaluate(card=>getComputedStyle(card).backgroundColor)).toBe('rgb(249, 249, 249)')
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)

it('does not decorate typed tag-like text or an unrelated skill that shares the label',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>window.previewFixture.text('/efund-ppt-maker 这只是文字 /ework-equity-research'))
  expect(await page.locator('[data-odyssey-deliverable-art]').count()).toBe(0)
  await page.evaluate(()=>window.previewFixture.add('ppt','ework-managed-skill','imported:efund-ppt-maker'))
  expect(await page.locator('[data-odyssey-deliverable-art]').count()).toBe(0)
 }finally{await page.close()}
},15000)

it.each(['home','conversation'])('keeps the cover fixed while only long native text scrolls above the independent toolbar (%s)',async mode=>{
 const page=await fixture({mode})
 try{
  await page.evaluate(()=>{window.previewFixture.add('report');window.previewFixture.append('需要保留的正文\n'.repeat(90))})
  await page.waitForSelector('[data-odyssey-deliverable-art]',{state:'attached'})
  const metrics=()=>page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{y:r.y,height:r.height,bottom:r.bottom}};const scroll=document.querySelector('[data-input-scroll]');return{card:rect('[data-composer-card]'),art:rect('.odyssey-deliverable-artboard'),row:rect('.uV2eYG_row'),scroll:rect('[data-input-scroll]'),scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight}})
  const before=await metrics()
  expect(before.card.height).toBeCloseTo(384,1);expect(before.scroll.height).toBeCloseTo(336,1)
  expect(before.scrollHeight).toBeGreaterThan(before.scroll.height)
  await page.locator('[data-input-scroll]').evaluate(element=>{element.scrollTop=120})
  const after=await metrics()
  expect(after.scrollTop).toBe(120);expect(after.art.y).toBeCloseTo(before.art.y,2);expect(after.row.y).toBeCloseTo(before.row.y,2)
  expect(after.row.bottom).toBeCloseTo(after.card.bottom,1)
  await page.locator('[data-composer-card]').screenshot({path:evidence+'/report-expanded.png'})
 }finally{await page.close()}
},15000)

it.each([520,400,280])('preserves a usable native input in a %spx pane',async width=>{
 const page=await fixture({width})
 try{
  await page.evaluate(()=>{window.previewFixture.add('ppt');window.previewFixture.append('窄窗继续编辑');window.savedInput=document.querySelector('textarea')})
  await page.waitForSelector('[data-odyssey-deliverable-art]',{state:'attached'})
  const actual=await page.locator('textarea').evaluate(input=>{const style=getComputedStyle(input);return{available:input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),padding:style.paddingLeft,rootWidth:input.closest('[data-composer-card]').getBoundingClientRect().width,overflow:input.closest('[data-composer-card]').scrollWidth}})
  expect(actual.available).toBeGreaterThanOrEqual(240);expect(actual.rootWidth).toBeCloseTo(width,1);expect(actual.overflow).toBeLessThanOrEqual(width+1)
  expect(await page.locator('[data-odyssey-deliverable-art]').evaluate(element=>getComputedStyle(element).display)).toBe(width<=410?'none':'block')
  await page.locator('textarea').focus();await page.keyboard.press('End');await page.keyboard.insertText('补充')
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toContain('补充')
  expect(await page.evaluate(()=>window.savedInput===document.querySelector('textarea'))).toBe(true)
  await page.locator('[data-composer-card]').screenshot({path:evidence+'/pane-'+width+'.png'})
 }finally{await page.close()}
},15000)

it('closes only the shown skill through the native journal and keeps text, other references, images, selection and undo',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>{const f=window.previewFixture;f.add('ppt');f.append('正文😀\n保留空行\n\n');f.add('report');f.shell.insertReference({source:'file',ref:'{"path":"keep.pdf"}',label:'keep.pdf',clipboardText:'keep.pdf'},{start:f.shell.snapshot.draft.length,end:f.shell.snapshot.draft.length,draftRev:f.shell.snapshot.draftRev});f.shell.addImages(['image-keep']);window.beforeClose=f.shell.snapshot;window.keepInput=document.querySelector('textarea')})
  const input=page.locator('textarea');await input.focus()
  await input.evaluate(el=>el.setSelectionRange(2,el.value.length,'backward'))
  await page.getByRole('button',{name:'移除研报技能及配图'}).click({timeout:1500})
  const after=await page.evaluate(()=>{const f=window.previewFixture,b=window.beforeClose,at=b.occurrences.find(o=>JSON.parse(o.ref).id==='builtin:ework-equity-research').offset,el=document.querySelector('textarea');return{draft:f.shell.snapshot.draft,expected:b.draft.slice(0,at)+b.draft.slice(at+1),ids:f.shell.snapshot.occurrences.map(o=>o.occurrenceId),expectedIds:b.occurrences.filter(o=>o.offset!==at).map(o=>o.occurrenceId),images:f.shell.snapshot.imageIds,range:[el.selectionStart,el.selectionEnd,el.selectionDirection],focus:document.activeElement===window.keepInput,length:b.draft.length}})
  expect(after.draft).toBe(after.expected);expect(after.ids).toEqual(after.expectedIds);expect(after.images).toEqual(['image-keep']);expect(after.range).toEqual([2,after.length-1,'backward']);expect(after.focus).toBe(true)
  expect(await page.locator('[data-odyssey-deliverable-art="ppt"]').count()).toBe(1)
  await page.evaluate(()=>window.previewFixture.shell.undo())
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft===window.beforeClose.draft&&JSON.stringify(window.previewFixture.shell.snapshot.occurrences)===JSON.stringify(window.beforeClose.occurrences))).toBe(true)
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)

it('limits annotation sidecar deletion to the cover skill even when the entire Chinese and emoji draft is selected',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>{const f=window.previewFixture;f.add('ppt');f.append('整体要求😀\n');f.bindAnnotation();f.add('report');f.append('尾部用户要求');window.beforeClose=f.shell.snapshot;window.beforeRanges=f.binding.ranges()})
  await page.locator('textarea').focus();await page.locator('textarea').evaluate(el=>el.setSelectionRange(0,el.value.length,'backward'))
  await page.getByRole('button',{name:'移除研报技能及配图'}).click({timeout:1500})
  const result=await page.evaluate(()=>{const f=window.previewFixture,b=window.beforeClose,at=b.occurrences.find(o=>{try{return JSON.parse(o.ref).id==='builtin:ework-equity-research'}catch{return false}}).offset;return{actual:f.shell.snapshot.draft,expected:b.draft.slice(0,at)+b.draft.slice(at+1),ranges:f.binding.ranges(),before:window.beforeRanges}})
  expect(result.actual).toBe(result.expected);expect(result.ranges).toEqual(result.before)
  await page.evaluate(()=>window.previewFixture.add('ppt'))
  expect(await page.evaluate(()=>window.previewFixture.binding.ranges())).toEqual(result.before)
  await page.evaluate(()=>{window.previewFixture.shell.undo();window.previewFixture.shell.undo()})
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toBe(await page.evaluate(()=>window.beforeClose.draft))
 }finally{await page.close()}
},15000)

it.each([{kind:'ppt',dark:false,width:780},{kind:'ppt',dark:true,width:520},{kind:'report',dark:false,width:520},{kind:'report',dark:true,width:780}])('anchors the original upright 43B SVG to the rotated cover corner through growth and scrolling ($kind dark=$dark width=$width)',async({kind,dark,width})=>{
 const page=await fixture({dark,width})
 try{
  await page.evaluate(kind=>{window.previewFixture.add(kind);window.previewFixture.append('研究需求😀')},kind)
  const button=page.locator('.odyssey-deliverable-close')
  await button.waitFor()
  await page.waitForFunction(()=>[...document.querySelectorAll('.odyssey-deliverable-close img')].every(image=>image.complete&&image.naturalWidth===28))
  const geometry=()=>page.evaluate(()=>{const el=document.querySelector('.odyssey-deliverable-close'),cover=document.querySelector('.odyssey-deliverable-cover'),r=el.getBoundingClientRect(),c=cover.getBoundingClientRect(),s=getComputedStyle(cover),m=new DOMMatrix(s.transform),w=parseFloat(s.width),h=parseFloat(s.height);return{x:r.x,y:r.y,width:r.width,height:r.height,cornerX:c.x+c.width/2+m.a*w/2-m.c*h/2,cornerY:c.y+c.height/2+m.b*w/2-m.d*h/2,transform:getComputedStyle(el).transform,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el,assets:[...el.querySelectorAll('img')].map(i=>[i.naturalWidth,i.naturalHeight,i.getAttribute('width'),i.getAttribute('height')])}})
  const before=await geometry()
  expect(before.width).toBe(28);expect(before.height).toBe(28);expect(before.transform).toBe('none');expect(before.hit).toBe(true)
  expect(Math.abs(before.x+14-before.cornerX)).toBeLessThan(.08);expect(Math.abs(before.y+14-before.cornerY)).toBeLessThan(.08)
  expect(before.assets).toEqual([[28,28,'28','28'],[28,28,'28','28']])
  await page.locator('[data-composer-card]').screenshot({path:evidence+`/close-${kind}-${dark?'dark':'light'}-${width}.png`})
  await button.hover();expect(await button.locator('.odyssey-deliverable-close-hover').evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  await page.locator('[data-composer-card]').screenshot({path:evidence+`/close-${kind}-${dark?'dark':'light'}-${width}-hover.png`})
  await page.evaluate(()=>window.previewFixture.append('\n长正文不移动配图。'.repeat(80)))
  await page.locator('[data-input-scroll]').evaluate(el=>{el.scrollTop=120})
  const after=await geometry();expect(after.x).toBeCloseTo(before.x,2);expect(after.y).toBeCloseTo(before.y,2);expect(after.hit).toBe(true)
 }finally{await page.close()}
},15000)

it('removes only the last duplicate and leaves earlier identical native skills usable',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>{const f=window.previewFixture;f.add('ppt');f.append('保留文字\n\n');f.add('ppt');window.beforeClose=f.shell.snapshot})
  await page.getByRole('button',{name:'移除 PPT 技能及配图'}).click()
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.occurrences.map(o=>o.occurrenceId))).toEqual(await page.evaluate(()=>[window.beforeClose.occurrences[0].occurrenceId]))
  expect(await page.locator('[data-odyssey-deliverable-art="ppt"]').count()).toBe(1)
  await page.getByRole('button',{name:'移除 PPT 技能及配图'}).click()
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toBe(await page.evaluate(()=>window.beforeClose.draft.replaceAll('\uFFFC','')))
  expect(await page.locator('[data-odyssey-deliverable-art]').count()).toBe(0)
 }finally{await page.close()}
},15000)

it('rejects old ABA handlers, changed session owners, composition, locked and busy states',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>window.previewFixture.add('ppt'))
  await page.locator('.odyssey-deliverable-close').waitFor()
  await page.evaluate(()=>{const button=document.querySelector('.odyssey-deliverable-close');window.oldButton=button;window.oldClose=button[Object.keys(button).find(key=>key.startsWith('__reactProps$'))].onClick;const f=window.previewFixture;f.append('临时');f.shell.undo();window.beforeClose=f.shell.snapshot})
  await page.evaluate(()=>window.oldClose({preventDefault(){},stopPropagation(){},currentTarget:window.oldButton}))
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draftRev)).toBe(await page.evaluate(()=>window.beforeClose.draftRev))
  await page.evaluate(()=>window.previewFixture.force({sessionId:'another-owner'}))
  await page.evaluate(()=>window.oldClose({preventDefault(){},stopPropagation(){},currentTarget:window.oldButton}))
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toBe(await page.evaluate(()=>window.beforeClose.draft))
  await page.locator('textarea').dispatchEvent('compositionstart')
  await page.locator('.odyssey-deliverable-close').click()
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toBe(await page.evaluate(()=>window.beforeClose.draft))
  await page.locator('textarea').dispatchEvent('compositionend');await page.waitForTimeout(20)
  await page.evaluate(()=>window.previewFixture.force({disabled:true}))
  expect(await page.locator('.odyssey-deliverable-close').isDisabled()).toBe(true)
  await page.evaluate(()=>window.previewFixture.force({disabled:false}))
  await page.evaluate(()=>window.previewFixture.phase('submitting'))
  expect(await page.locator('.odyssey-deliverable-close').isDisabled()).toBe(true)
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toBe(await page.evaluate(()=>window.beforeClose.draft))
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)

it('returns keyboard focus to the same native input when Enter removes the last cover button',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>{window.previewFixture.add('ppt');window.previewFixture.append('正文保留');window.keepInput=document.querySelector('textarea')})
  await page.locator('textarea').evaluate(el=>el.setSelectionRange(3,5))
  const button=page.getByRole('button',{name:'移除 PPT 技能及配图'});await button.focus();await button.press('Enter')
  await expect.poll(()=>page.evaluate(()=>document.activeElement===window.keepInput)).toBe(true)
  expect(await page.locator('textarea').evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([2,4])
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)
