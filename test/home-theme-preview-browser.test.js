import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

let browser,script
const evidence=process.env.SHERLOCK_THEME_PREVIEW_EVIDENCE||'/tmp/sherlock-theme-preview-20261101/browser'
beforeAll(async()=>{
 await mkdir(evidence,{recursive:true})
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import{mountHomeThemes,getHomeThemeController}from'./src/preload/home-themes';import{createHomeThemeRenderer}from'./src/preload/home-theme-renderer';mountHomeThemes(document);window.themes=getHomeThemeController(document);window.createTheme=createHomeThemeRenderer;`},bundle:true,platform:'browser',format:'iife',write:false,plugins:[{name:'inline-theme-images',setup(builder){
  builder.onResolve({filter:/\.(?:png|jpg)\?inline$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'theme-image'}))
  builder.onLoad({filter:/.*/,namespace:'theme-image'},async args=>({contents:'export default '+JSON.stringify('data:image/'+(args.path.endsWith('.jpg')?'jpeg':'png')+';base64,'+(await readFile(args.path)).toString('base64')),loader:'js'}))
 }}]});script=result.outputFiles[0].text
 const runtime=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(runtime.default??runtime).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--enable-unsafe-swiftshader']})
},30000)
afterAll(()=>browser?.close())
async function fixture(dark){
 const page=await browser.newPage({viewport:{width:900,height:650},deviceScaleFactor:2}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.setContent('<body'+(dark?' data-ds-dark-theme':'')+'></body>');await page.addScriptTag({content:script})
 return{page,errors}
}
for(const dark of [false,true])it(`matches the last two static cards to their actual initial live scene in ${dark?'dark':'light'}`,async()=>{
 const{page,errors}=await fixture(dark)
 try{
  const results=[]
  for(const id of ['dither','koi-pond']){
   await page.evaluate(({id,dark})=>{const view=window.themes.createPreview(id);if(!view)throw Error('Preview unavailable');window.preview=view;document.body.append(view.canvas);view.resize(163.2,163.2*78/146.4);view.render(0,dark)},{id,dark})
   if(id==='koi-pond')await page.waitForFunction(()=>window.preview.canvas.dataset.homeKoiState==='ready')
   const result=await page.evaluate(async({id,dark})=>{
    const view=window.preview,canvas=view.canvas
    const image=new Image();image.src=window.themes.getThumbnail(id);await image.decode()
    const still=document.createElement('canvas');still.width=canvas.width;still.height=canvas.height
    const ctx=still.getContext('2d');ctx.drawImage(image,0,0,still.width,still.height);const expected=ctx.getImageData(0,0,still.width,still.height).data
    view.render(0,dark);const initial=canvas.toDataURL('image/png');ctx.drawImage(canvas,0,0);const actual=ctx.getImageData(0,0,still.width,still.height).data
    let difference=0,fish=0,hash=2166136261
    for(let i=0;i<actual.length;i+=4){for(let c=0;c<3;c++)difference+=Math.abs(actual[i+c]-expected[i+c]);if(actual[i]>actual[i+2]*1.2&&actual[i]>90)fish++;hash=Math.imul(hash^actual[i],16777619)}
    for(let frame=1;frame<=48;frame++)view.render(frame/24,dark)
    const moving=canvas.toDataURL('image/png');view.dispose()
    return{id,dark,difference:difference/(actual.length/4*3),fishFraction:fish/(actual.length/4),hash,initial,moving,selected:window.themes.getSelected(),released:canvas.getContext(id==='koi-pond'?'webgl':'webgl2').isContextLost()}
   },{id,dark})
   expect(result.difference,id).toBeLessThan(id==='dither'?2:0.01)
   expect(result.initial,id).not.toBe(result.moving)
   expect(result.selected).toBe('default');expect(result.released).toBe(true)
   if(id==='koi-pond'){expect(result.fishFraction).toBeGreaterThan(.002);expect(result.fishFraction).toBeLessThan(.055)}
   for(const state of ['initial','moving'])await writeFile(`${evidence}/${id}-${dark?'dark':'light'}-${state}.png`,Buffer.from(result[state].split(',')[1],'base64'))
   const{initial,moving,...summary}=result;results.push(summary)
  }
  expect(errors).toEqual([]);await writeFile(`${evidence}/preview-parity-${dark}.json`,JSON.stringify(results,null,2))
 }finally{await page.close()}
},30000)

it('keeps Koi fish proportion stable across responsive cards and leaves the main pond at its original CSS scale',async()=>{
 const{page,errors}=await fixture(false)
 try{
  const sizes=[[110,110*78/146.4],[260,260*78/146.4]],results=[]
  for(const size of sizes){
   await page.evaluate(size=>{window.preview=window.themes.createPreview('koi-pond');document.body.append(window.preview.canvas);window.preview.resize(...size);window.preview.render(0,false)},size)
   await page.waitForFunction(()=>window.preview.canvas.dataset.homeKoiState==='ready')
   const stats=await page.evaluate(()=>{const view=window.preview,canvas=view.canvas;view.render(0,false);const ctx=document.createElement('canvas').getContext('2d');ctx.canvas.width=canvas.width;ctx.canvas.height=canvas.height;ctx.drawImage(canvas,0,0);const bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data;let fish=0;for(let i=0;i<bytes.length;i+=4)if(bytes[i]>bytes[i+2]*1.2&&bytes[i]>90)fish++;view.dispose();return{fraction:fish/(bytes.length/4),pixels:[canvas.width,canvas.height]}})
   expect(stats.fraction).toBeGreaterThan(.002);expect(stats.fraction).toBeLessThan(.055);results.push(stats)
  }
  expect(Math.abs(results[0].fraction-results[1].fraction)).toBeLessThan(.005)
  await page.evaluate(()=>{window.originalNow=Date.now;Date.now=()=>0x5eed;window.mainCanvas=document.createElement('canvas');document.body.append(window.mainCanvas);window.main=window.createTheme(window.mainCanvas,'koi-pond',{dark:false});window.main.resize(920,600);window.main.render(0,false)})
  await page.waitForFunction(()=>window.mainCanvas.dataset.homeKoiState==='ready')
  const main=await page.evaluate(()=>{window.main.render(0,false);const gl=window.mainCanvas.getContext('webgl'),p=gl.getParameter(gl.CURRENT_PROGRAM),resolution=gl.getUniform(p,gl.getUniformLocation(p,'u_resolution'));const result={pixels:[window.mainCanvas.width,window.mainCanvas.height],resolution:[...resolution]};window.main.dispose();Date.now=window.originalNow;return result})
  expect(main.resolution).toEqual([920,600]);expect(main.pixels).toEqual([1150,750]);expect(errors).toEqual([])
  await writeFile(evidence+'/koi-responsive-main.json',JSON.stringify({cards:results,main},null,2))
 }finally{await page.close()}
},30000)
