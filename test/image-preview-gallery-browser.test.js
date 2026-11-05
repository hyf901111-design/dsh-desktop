import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {parse} from '@babel/parser'
import {build} from 'esbuild'
import {beforeAll,afterAll,it,expect} from 'vitest'
import {patchImagePreviewGallery} from '../scripts/lib/image-preview-gallery.mjs'
let browser,bundle,sources={}
const evidence=process.env.SHERLOCK_IMAGE_GALLERY_EVIDENCE||'/tmp/image-preview-gallery-focus-20261105'
beforeAll(async()=>{
 bundle=(await build({entryPoints:['test/fixtures/image-preview-gallery-browser.tsx'],bundle:true,format:'iife',platform:'browser',write:false,define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text
 for(const web of [false,true]){
  const path=web?'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-C-1AiF3k.js':'node_modules/@deepseek-ai/dsh-client-ui-attachment/lib/index.js'
  const source=patchImagePreviewGallery(await readFile(path,'utf8'),web)
  expect(patchImagePreviewGallery(source,web)).toBe(source)
  const functions=parse(source,{sourceType:'module'}).program.body.filter(n=>n.type==='FunctionDeclaration'&&[web?'Nc':'ImageLightbox',web?'Rc':'MessageImage',web?'Im':'ImageGallery',web?'Tm':'singleFit'].includes(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n')
  const own=source.slice(source.indexOf('/* ework:image-preview-gallery:v1 */'),source.indexOf('/* ework:image-preview-gallery:end */'))
  sources[web?'web':'native']=`window.imagePreviewFactory=(React,JSX,DOM)=>{const {useRef,useEffect,useState,useCallback,useMemo}=React,{jsx,jsxs,Fragment}=JSX,{createPortal}=DOM;const R=React,f=JSX,ln=DOM,fu=()=>null,IconCloseOutline16=fu;const zo={},Wo={gallery:'gallery',frame:'thumbnail',error:'load-error'},ImageLightbox_module_css_default=zo,MessageImage_module_css_default=Wo;${functions}\n${own}\nreturn {ImageGallery:${web?'Im':'ImageGallery'}}}`
 }
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
})
afterAll(async()=>browser?.close())
async function fixture(target,options={}){
 const page=await browser.newPage({viewport:{width:options.width??1120,height:options.height??760}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setContent('<html><div id="app"></div></html>');await page.addStyleTag({content:'body{background:#1f1f1f;color:#fff;font-family:system-ui}.gallery{display:flex;gap:12px;margin:24px}.thumbnail{padding:0;width:64px;height:64px;overflow:hidden;border:0;border-radius:12px;cursor:pointer}.thumbnail img{width:100%;height:100%;object-fit:cover}#outside{margin:24px}'});await page.addScriptTag({content:sources[target]});await page.addScriptTag({content:bundle});await page.evaluate(options=>window.imagePreviewHarness(options),options)
 await expect.poll(()=>page.locator('section').first().locator('button img').count()).toBe((options.count??4)-(options.fail?1:0))
 return{page,errors}
}
for(const target of ['native','web']){

 it(target+' keeps navigation fixed while images change size and leaves room around enlarged images',async()=>{
  const{page,errors}=await fixture(target,{width:1380,height:900,count:3,sizes:[{width:620,height:340},{width:360,height:1000},{width:2400,height:900}]});try{
   await page.getByRole('button',{name:'放大 page-1.svg',exact:true}).click()
   const modal=page.getByRole('dialog'),image=modal.locator('[data-image-preview-image]'),previous=modal.locator('[data-image-preview-control=previous]'),next=modal.locator('[data-image-preview-control=next]')
   const spaced=async(gap)=>{
    const a=await image.boundingBox(),p=await previous.boundingBox(),n=await next.boundingBox(),{width,height}=page.viewportSize()
    return !!a&&!!p&&!!n&&a.x-p.x-p.width>=gap-1&&n.x-a.x-a.width>=gap-1&&Math.abs(p.y+p.height/2-height/2)<1&&Math.abs(n.y+n.height/2-height/2)<1&&p.x>=16&&n.x+n.width<=width-16&&n.x+n.width-p.x<=1440
   }
   await expect.poll(()=>spaced(16)).toBe(true)
   const left=await previous.boundingBox(),right=await next.boundingBox()
   expect(left.x).toBeGreaterThanOrEqual(64)
   await page.screenshot({path:evidence+'/'+target+'-image-fixed-small.png'})
   // Reuse the same pointer coordinates: changing aspect ratio must not move the target.
   await page.mouse.click(right.x+right.width/2,right.y+right.height/2)
   await expect.poll(()=>image.getAttribute('alt')).toBe('page-2.svg')
   expect(await previous.boundingBox()).toEqual(left);expect(await next.boundingBox()).toEqual(right)
   await page.mouse.click(right.x+right.width/2,right.y+right.height/2)
   await expect.poll(()=>image.getAttribute('alt')).toBe('page-3.svg')
   expect(await previous.boundingBox()).toEqual(left);expect(await next.boundingBox()).toEqual(right)
   await expect.poll(()=>spaced(16)).toBe(true)
   await page.screenshot({path:evidence+'/'+target+'-image-fixed-wide.png'})
   await page.setViewportSize({width:3440,height:1322});await expect.poll(()=>spaced(16)).toBe(true)
   await page.setViewportSize({width:390,height:720});await expect.poll(()=>spaced(8)).toBe(true)
   const narrowLeft=await previous.boundingBox(),narrowRight=await next.boundingBox()
   await page.screenshot({path:evidence+'/'+target+'-image-fixed-narrow.png'})
   await page.keyboard.press('ArrowLeft');await expect.poll(()=>image.getAttribute('alt')).toBe('page-2.svg');await expect.poll(()=>spaced(8)).toBe(true)
   expect(await previous.boundingBox()).toEqual(narrowLeft);expect(await next.boundingBox()).toEqual(narrowRight)
   await page.setViewportSize({width:1380,height:900});await page.keyboard.press('ArrowLeft');await expect.poll(()=>image.getAttribute('alt')).toBe('page-1.svg')
   // The fixed frame must not swallow a backdrop click in the empty area above the image.
   await page.mouse.click(690,100);await expect.poll(()=>modal.count()).toBe(0)
   expect(errors).toEqual([])
  }finally{await page.close()}
 })


 for(const {opener,direction,boundary} of [
  {opener:'page-1.svg',direction:'下一张图片',boundary:'2 / 2'},
  {opener:'page-2.svg',direction:'上一张图片',boundary:'1 / 2'}
 ])for(const key of ['Tab','Shift+Tab'])it(target+' traps '+key+' after '+direction+' becomes disabled',async()=>{
  const{page,errors}=await fixture(target,{count:2});try{
   const thumbnail=page.getByRole('button',{name:'放大 '+opener,exact:true})
   await thumbnail.click()
   await page.getByRole('button',{name:direction}).click()
   await expect.poll(()=>page.locator('[data-image-preview-counter]').innerText()).toBe(boundary)
   expect(await page.getByRole('button',{name:direction}).isDisabled()).toBe(true)
   for(let i=0;i<4;i++){
    await page.keyboard.press(key)
    expect(await page.evaluate(()=>!!document.activeElement?.closest('[data-image-preview-dialog]')&&!document.activeElement.disabled)).toBe(true)
   }
   await page.keyboard.press('Escape')
   await expect.poll(()=>page.getByRole('dialog').count()).toBe(0)
   expect(await thumbnail.evaluate(el=>el===document.activeElement)).toBe(true)
   expect(errors).toEqual([])
  }finally{await page.close()}
 })
 it(target+' traps Tab after the focused retry control is replaced by the loaded image',async()=>{
  const{page,errors}=await fixture(target,{count:2,fail:'image-1'});try{
   await page.getByRole('button',{name:'放大 page-1.svg',exact:true}).click()
   await page.keyboard.press('ArrowRight')
   const modal=page.getByRole('dialog')
   await modal.getByRole('button',{name:'重新载入图片'}).click()
   await expect.poll(()=>modal.locator('img').getAttribute('alt')).toBe('page-2.svg')
   await page.keyboard.press('Tab')
   expect(await page.evaluate(()=>!!document.activeElement?.closest('[data-image-preview-dialog]'))).toBe(true)
   expect(errors).toEqual([])
  }finally{await page.close()}
 })
 it(target+' navigates one thumbnail group using buttons and keyboard, honors boundaries and restores opener focus',async()=>{
  const{page,errors}=await fixture(target);try{
   const first=page.getByRole('button',{name:'放大 page-2.svg',exact:true});await first.focus();await first.click()
   const modal=page.getByRole('dialog'),counter=page.locator('[data-image-preview-counter]')
   await expect.poll(()=>counter.innerText()).toBe('2 / 4')
   await page.getByRole('button',{name:'下一张图片'}).click();await expect.poll(()=>modal.locator('img').getAttribute('alt')).toBe('page-3.svg')
   await page.keyboard.press('ArrowRight');await expect.poll(()=>counter.innerText()).toBe('4 / 4');expect(await page.getByRole('button',{name:'下一张图片'}).isDisabled()).toBe(true)
   await page.keyboard.press('ArrowRight');expect(await counter.innerText()).toBe('4 / 4')
   for(let i=0;i<4;i++)await page.keyboard.press('ArrowLeft')
   await expect.poll(()=>counter.innerText()).toBe('1 / 4');expect(await page.getByRole('button',{name:'上一张图片'}).isDisabled()).toBe(true)
   const close=page.getByRole('button',{name:'关闭',exact:true}),box=await close.boundingBox(),icon=await close.locator('svg').boundingBox();expect(Math.abs(icon.x+icon.width/2-box.x-box.width/2)).toBeLessThan(.1);expect(Math.abs(icon.y+icon.height/2-box.y-box.height/2)).toBeLessThan(.1)
   await page.screenshot({path:evidence+'/'+target+'-gallery.png'})
   await page.keyboard.press('Escape');await expect.poll(()=>modal.count()).toBe(0);expect(await first.evaluate(n=>n===document.activeElement)).toBe(true)
   await page.keyboard.press('ArrowRight');expect(await modal.count()).toBe(0)
   await first.click();await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>document.activeElement?.getAttribute('data-image-preview-control'))).toBe('next')
   await page.locator('[data-image-preview-mask]').click({position:{x:4,y:70}});await expect.poll(()=>modal.count()).toBe(0);expect(errors).toEqual([])
  }finally{await page.close()}
 })
 it(target+' supports single images, English mobile controls, retry and stale loading cancellation',async()=>{
  const{page,errors}=await fixture(target,{count:1,english:true,width:390});try{
   await page.getByRole('button',{name:'Open page-1.svg',exact:true}).click();expect(await page.locator('[data-image-preview-counter]').count()).toBe(0);await page.keyboard.press('ArrowRight');expect(await page.getByRole('dialog').locator('img').getAttribute('alt')).toBe('page-1.svg');await page.getByRole('button',{name:'Close',exact:true}).click();await expect.poll(()=>page.getByRole('dialog').count()).toBe(0)
   await page.evaluate(()=>window.imagePreviewHarness({count:4,english:true,fail:'image-1',delays:{'image-2':150}}))
   await page.getByRole('button',{name:'Open page-1.svg',exact:true}).click();await page.keyboard.press('ArrowRight');const retry=page.getByRole('button',{name:'Retry image',exact:true});await expect.poll(()=>retry.count()).toBe(2);await page.getByRole('dialog').getByRole('button',{name:'Retry image'}).click();await expect.poll(()=>page.getByRole('dialog').locator('img').getAttribute('alt')).toBe('page-2.svg')
   await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await expect.poll(()=>page.getByRole('dialog').locator('img').getAttribute('alt')).toBe('page-4.svg');await page.waitForTimeout(200);expect(await page.getByRole('dialog').locator('img').getAttribute('alt')).toBe('page-4.svg')
   await page.screenshot({path:evidence+'/'+target+'-mobile-en.png'});await page.evaluate(()=>window.imagePreviewUnmount());await expect.poll(()=>page.getByRole('dialog').count()).toBe(0);expect(errors).toEqual([])
  }finally{await page.close()}
 })
 it(target+' keeps all 32 tool-image previews in their displayed order',async()=>{
  const{page,errors}=await fixture(target,{count:32});try{
   await page.getByRole('button',{name:'放大 page-31.svg',exact:true}).click();await expect.poll(()=>page.locator('[data-image-preview-counter]').innerText()).toBe('31 / 32')
   await page.keyboard.press('ArrowRight');await expect.poll(()=>page.getByRole('dialog').locator('img').getAttribute('alt')).toBe('page-32.svg');expect(await page.getByRole('button',{name:'下一张图片'}).isDisabled()).toBe(true);expect(errors).toEqual([])
  }finally{await page.close()}
 })
}
