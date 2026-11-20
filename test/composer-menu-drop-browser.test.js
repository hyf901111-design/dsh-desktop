import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {build} from 'esbuild'
import {PNG} from 'pngjs'
import {ensureDshFileDropResearchCanvasCompatibility} from '../src/main/state/dsh-file-drop-compat'
const require=createRequire(import.meta.url),{patchSkillCommandPopup}=require('../scripts/lib/skill-command-menu.mjs')
const {patchExpandedCommandMenu}=require('../scripts/lib/expanded-command-menu.mjs')
const evidence='/tmp/composer-menu-drop-20261027'
let browser,sources,script,styles,temp
beforeAll(async()=>{
 await mkdir(evidence,{recursive:true});temp=await mkdtemp(join(tmpdir(),'composer-menu-drop-'))
 const directory=join(temp,'profiles/web/node_modules/dsh-file-drop');await mkdir(directory,{recursive:true})
 await writeFile(join(directory,'package.json'),JSON.stringify({name:'dsh-file-drop',version:'1.0.0'}));await writeFile(join(directory,'client.js'),await readFile('test/fixtures/dsh-file-drop-1.0.0-client.js','utf8'))
 expect((await ensureDshFileDropResearchCanvasCompatibility(temp)).status).toBe('patched')
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 sources={runtime:await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),conversation:raw.replace('exports.apply = apply;','exports.__InputBar=InputBar;exports.__ComposerSurface=ComposerSurface;exports.apply = apply;'),commands:patchExpandedCommandMenu(patchSkillCommandPopup(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')),'skills').replace('exports.apply = apply;','exports.__Popup=PopupSelectView;exports.apply = apply;'),fileDrop:await readFile(join(directory,'client.js'),'utf8')}
 const output=await build({entryPoints:['test/fixtures/composer-menu-drop-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}});script=output.outputFiles[0].text
 const shell=await build({stdin:{resolveDir:process.cwd(),contents:"import{mountDesktopShellStyles}from'./src/preload/shell-style';mountDesktopShellStyles(document)",loader:'ts'},bundle:true,platform:'browser',format:'iife',write:false,plugins:[{name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},a=>({path:a.path.startsWith('.')?resolve(a.resolveDir,a.path.slice(0,-4)):require.resolve(a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:'export default '+JSON.stringify(await readFile(a.path,'utf8')),loader:'js'}))}}]});styles=shell.outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},40000)
afterAll(async()=>{await browser?.close();await rm(temp,{recursive:true,force:true})})
async function fixture(dark=false,width=900,query=''){
 const page=await browser.newPage({viewport:{width,height:760}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.abort());page.setDefaultTimeout(3000)
 const css=Object.values(sources).flatMap(source=>[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1]))).join('\n')
 const html=`<meta charset="utf-8"><style>${css}body{margin:0;--dsw-alias-label-primary:${dark?'#eee':'#222'};--dsw-alias-label-tertiary:${dark?'#bbb':'#666'};font-family:system-ui}#composer{position:absolute;left:40px;top:80px;width:calc(100% - 80px)}#outside{position:absolute;bottom:0;width:100%;height:100px}.wSkVaW_heroWorkspaceRow{height:30px}.wSkVaW_composerStack{transform:translateY(0)}#menus{position:absolute;left:40px;bottom:160px;width:400px}</style><body ${dark?'data-ds-dark-theme':''}><main class="pI_x6G_centerCol"><section class="wSkVaW_root" data-odyssey-page="home"><div id="composer"></div></section></main><div id="menus"></div><div id="outside">窗口其他位置</div></body>`
 const url='http://127.0.0.1/composer-menu-drop'+query
 await page.route(url,route=>route.fulfill({contentType:'text/html',body:html}));await page.goto(url)
 await page.evaluate(sources=>{window.nativeModules={};for(const[key,source]of Object.entries(sources)){window.__ModuleLoader__={load:value=>window.nativeModules[key]=value};new Function(source)()}},sources)
 await page.addScriptTag({content:styles});await page.addScriptTag({content:script});await page.locator('textarea').waitFor().catch(error=>{throw Error(errors.join('\n')+' '+error.message)})
 return{page,errors,close:async()=>{await page.evaluate(()=>probe.dispose());await page.close()}}
}
for(const dark of [false,true])it(`prioritizes native skill options and shows only the two matching homepage illustrations, retaining native search and multi-pick (dark=${dark})`,async()=>{
 const f=await fixture(dark);try{
  await f.page.evaluate(()=>probe.open());const menu=f.page.locator('[data-ework-command=skills]');await menu.getByRole('option').first().waitFor().catch(async error=>{throw Error(JSON.stringify({state:await f.page.evaluate(()=>probe.popup.state.getSnapshot()),errors:f.errors,body:await f.page.locator('body').innerText()})+' '+error.message)})
  expect(await menu.getByRole('option').allTextContents()).toEqual(['PPT制作助手创建专业演示文稿','研报写作按照易方达配色规范创建和制作研究报告，支持公司研究、财报分析与估值核验。','自定义财报分析分析财务报告与估值','基础数据源获取研究数据','PPT 自定义技能用户自己的演示工具'])
  const metrics=await menu.getByRole('option').evaluateAll(rows=>rows.map(row=>{const b=row.getBoundingClientRect(),a=row.querySelector('.odyssey-deliverable-preview'),image=a?.querySelector('img'),label=row.querySelector('.mufS8W_label').getBoundingClientRect(),detail=row.querySelector('.mufS8W_detail').getBoundingClientRect();return{height:b.height,width:b.width,art:image?.getAttribute('src'),artWidth:a?.getBoundingClientRect().width,decoded:image?.complete&&image?.naturalWidth>0,label:label.x,detail:detail.x}}))
  for(const row of metrics.slice(0,2)){expect(row.art).toContain('data:image/png;base64,');expect(row.decoded).toBe(true);expect(row.artWidth).toBeGreaterThanOrEqual(32);expect(row.label).toBe(row.detail);expect(row.height).toBeLessThanOrEqual(58)}
  expect(metrics.slice(2).every(row=>row.art===undefined)).toBe(true);await f.page.screenshot({path:join(evidence,`skills-${dark?'dark':'light'}.png`)})
  await menu.getByRole('textbox').fill('财务');expect(await menu.getByRole('option').allTextContents()).toEqual(['自定义财报分析分析财务报告与估值']);await menu.getByRole('textbox').fill('专业演示');await menu.getByRole('option').click();await expect.poll(()=>f.page.evaluate(()=>probe.selections)).toEqual(['builtin:efund-ppt-maker'])
  await f.page.evaluate(()=>probe.open());await menu.getByRole('textbox').fill('估值核验');await menu.getByRole('option').click();await expect.poll(()=>f.page.evaluate(()=>probe.selections)).toEqual(['builtin:efund-ppt-maker','builtin:ework-equity-research']);expect(await f.page.evaluate(()=>probe.shell.snapshot.occurrences.length)).toBe(2);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
for(const dark of [false,true])it(`paints both skill illustrations in the narrow research side conversation (dark=${dark})`,async()=>{
 const f=await fixture(dark);try{
  await f.page.evaluate(()=>{
   document.querySelector('.wSkVaW_root').dataset.odysseyPage='research'
   const side=document.querySelector('#menus')
   side.className='sRp_root'
   // The real right-side panel is an inline-size query container.
   Object.assign(side.style,{containerType:'inline-size',overflow:'hidden',left:'auto',right:'14px',top:'475px',bottom:'18px',width:'316px',height:'auto'})
   probe.extendSkillCatalog(8)
   probe.open()
  })
  const menu=f.page.locator('[data-ework-command=skills]'),rows=menu.getByRole('option'),art=rows.locator('.odyssey-deliverable-preview')
  await rows.first().waitFor()
  expect(await art.count()).toBe(2)
  for(const [index,kind] of ['ppt','report'].entries()){
   const illustration=art.nth(index)
   expect(await illustration.isVisible()).toBe(true)
   expect(await illustration.locator('img').first().evaluate(image=>image.decode().then(()=>image.naturalWidth))).toBeGreaterThan(0)
   const png=PNG.sync.read(await illustration.screenshot({path:join(evidence,`research-side-${kind}-${dark?'dark':'light'}.png`)}))
   let bluePixels=0
   for(let i=0;i<png.data.length;i+=4){
    const [red,green,blue]=png.data.subarray(i,i+3)
    if(blue>100&&blue>red+35&&blue>green+12)bluePixels++
   }
   expect(bluePixels).toBeGreaterThan(10)
  }
  const layout=await menu.evaluate(element=>{
   const viewport=element.querySelector('.mufS8W_viewport'),bounds=element.getBoundingClientRect(),side=element.closest('.sRp_root').getBoundingClientRect()
   return{left:bounds.left,right:bounds.right,sideLeft:side.left,sideRight:side.right,scroll:viewport.scrollHeight>viewport.clientHeight,columns:new Set([...viewport.children].map(row=>row.getBoundingClientRect().left)).size}
  })
  expect(layout.left).toBeGreaterThanOrEqual(layout.sideLeft)
  expect(layout.right).toBeLessThanOrEqual(layout.sideRight)
  expect(layout.scroll).toBe(true)
  expect(layout.columns).toBe(1)
  await menu.screenshot({path:join(evidence,`research-side-skills-${dark?'dark':'light'}.png`)})
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
for(const dark of [false,true])it(`confines real global file-drop feedback to the input card and clears it after leave or outside drop (dark=${dark})`,async()=>{
 const f=await fixture(dark,620);try{
  const dispatch=async(type,target='#outside')=>f.page.locator(target).dispatchEvent(type,{dataTransfer:await f.page.evaluateHandle(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['pdf'],'qa.pdf',{type:'application/pdf'}));return transfer})})
  await dispatch('dragenter');const overlay=f.page.locator('.dsh-drop-overlay');await overlay.waitFor()
  const metrics=await f.page.evaluate(()=>{const pick=selector=>{const b=document.querySelector(selector).getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}};return{overlay:pick('.dsh-drop-overlay'),card:pick('[data-composer-card]'),workspace:pick('.wSkVaW_heroWorkspaceRow')}})
  for(const field of ['x','y','width','height'])expect(metrics.overlay[field]).toBeCloseTo(metrics.card[field],0)
  expect(metrics.overlay.y).toBeGreaterThanOrEqual(metrics.workspace.y+metrics.workspace.height)
  await f.page.screenshot({path:join(evidence,`drop-${dark?'dark':'light'}.png`)})
  await f.page.setViewportSize({width:420,height:760})
  await expect.poll(()=>f.page.evaluate(()=>{const a=document.querySelector('.dsh-drop-overlay').getBoundingClientRect(),b=document.querySelector('[data-composer-card]').getBoundingClientRect();return Math.max(...['x','y','width','height'].map(key=>Math.abs(a[key]-b[key])))})).toBeLessThan(.5)
  await dispatch('dragleave');await expect.poll(()=>overlay.count()).toBe(0)
  await dispatch('dragenter');await dispatch('drop');await expect.poll(()=>overlay.count()).toBe(0);expect(await f.page.evaluate(()=>probe.shell.snapshot.occurrences.map(value=>JSON.parse(value.ref).path))).toEqual(['/qa/外部附件.pdf']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('keeps the translated pinned skills searchable in a narrow native popup without adding artwork to custom names',async()=>{
 const f=await fixture(true,360);try{
  await f.page.evaluate(()=>{document.documentElement.dataset.odysseyLocale='en';probe.open()})
  const menu=f.page.locator('[data-ework-command=skills]');await menu.getByRole('option').first().waitFor()
  expect(await menu.getByRole('option').first().textContent()).toContain('Presentation assistant')
  await menu.getByRole('textbox').fill('Presentation');expect(await menu.getByRole('option').count()).toBe(1)
  const rect=await menu.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(360)
  await menu.getByRole('textbox').fill('PPT 自定义');expect(await menu.getByRole('option').count()).toBe(1);expect(await menu.locator('.odyssey-deliverable-preview').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([true,false])('routes composer file drops and pastes through the picker with dock=%s',async showDock=>{
 const files=[
  {name:'reference.png',mimeType:'image/png',buffer:Buffer.from('png')},
  {name:'report.pdf',mimeType:'application/pdf',buffer:Buffer.from('pdf')},
  {name:'workbook.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('xlsx')},
  {name:'diagram.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')},
 ]
 async function attach(method){
  const f=await fixture(false,900,'?attachments')
  try{
   await f.page.evaluate(show=>probe.setDock(show),showDock)
   const input=f.page.locator('[data-composer-card] input[type=file]')
   await input.waitFor({state:'attached'})
   if(method==='picker')await input.setInputFiles(files)
   else{
    const transfer=await f.page.evaluateHandle(descriptors=>{
     const data=new DataTransfer()
     for(const {name,mimeType} of descriptors)data.items.add(new File(['sample content'],name,{type:mimeType}))
     return data
    },files.map(({name,mimeType})=>({name,mimeType})))
    if(method==='drop'){
     await f.page.locator('textarea').dispatchEvent('dragover',{dataTransfer:transfer})
     await f.page.locator('textarea').dispatchEvent('drop',{dataTransfer:transfer})
    }else{
     await f.page.locator('textarea').evaluate((input,data)=>input.dispatchEvent(
      new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data})
     ),transfer)
    }
    await transfer.dispose()
   }
   const result=await f.page.evaluate(()=>({
    images:probe.files,paths:probe.shell.snapshot.occurrences.map(value=>JSON.parse(value.ref).path),
    imageOnlyFallback:probe.fallbackFiles??[],
   }))
   expect(f.errors).toEqual([])
   return result
  }finally{await f.close()}
 }
 const picked=await attach('picker')
 expect(picked).toEqual({images:['reference.png'],paths:['/qa/report.pdf','/qa/workbook.xlsx','/qa/diagram.svg'],imageOnlyFallback:[]})
 expect(await attach('drop')).toEqual(picked)
 expect(await attach('paste')).toEqual(picked)
},15000)
it('preserves ordinary text paste in the file-enabled composer',async()=>{
 const f=await fixture(false,900,'?attachments')
 try{
  const input=f.page.locator('textarea')
  await input.focus()
  await input.evaluate(element=>{
   const data=new DataTransfer()
   data.setData('text/plain','粘贴普通文本')
   element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))
  })
  expect(await input.inputValue()).toBe('粘贴普通文本')
  expect(await f.page.evaluate(()=>probe.files)).toEqual([])
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
for(const dark of [false,true])it(`dims only the disabled home send arrow, leaving enabled send, stop and reading intact (dark=${dark})`,async()=>{
 const f=await fixture(dark);try{
  const button=f.page.locator('.uV2eYG_primary'),opacity=()=>button.locator('svg').evaluate(el=>getComputedStyle(el).opacity)
  expect(await button.isDisabled()).toBe(true);expect(Number(await opacity())).toBeLessThanOrEqual(.55)
  await f.page.locator('textarea').fill('正常输入');expect(await button.isDisabled()).toBe(false);expect(Number(await opacity())).toBe(1)
  await f.page.locator('textarea').fill('');await f.page.evaluate(()=>probe.setRunning(true));await button.locator('svg rect').waitFor();expect(Number(await opacity())).toBe(1)
  await f.page.evaluate(()=>{probe.setRunning(false);document.querySelector('.wSkVaW_root').dataset.odysseyPage='conversation'});await button.locator('svg path').waitFor();expect(Number(await opacity())).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
