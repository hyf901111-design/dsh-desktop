import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'

let browser:any,script:string,css:string
const output=process.env.SHERLOCK_POINTER_APPEARANCE_OUTPUT||await mkdtemp(join(tmpdir(),'home-pointer-appearance-'))
beforeAll(async()=>{
 await mkdir(output,{recursive:true})
 css=await readFile('src/preload/home-guides.css','utf8')
 script=(await build({stdin:{resolveDir:process.cwd(),contents:`
 import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';
 window.abort=new AbortController();window.frames=[];
 window.pointer=createHomeGuidePointer(document,{runId:'appearance',signal:window.abort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()});
 window.start=()=>window.action=window.pointer.perform({action:'drag',target:document.querySelector('#end'),fromTarget:document.querySelector('#start'),onFrame:frame=>{const path=document.querySelector('[data-home-guide-pointer] svg path'),point=path.getPointAtLength(0).matrixTransform(path.getScreenCTM());window.frames.push({...frame,tip:{x:point.x,y:point.y}})}});
 `},bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'})).outputFiles[0]!.text
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>browser?.close())

it.each([{mode:'dark',dpr:1},{mode:'light',dpr:1},{mode:'dark',dpr:2},{mode:'light',dpr:2}])('matches the small rounded gray pointer and keeps its hotspot on every $mode DPR$dpr action frame',async({mode,dpr})=>{
 const page=await browser.newPage({viewport:{width:500,height:320},deviceScaleFactor:dpr})
 try{
  await page.clock.install();await page.setContent(`<style>body{margin:0;background:${mode==='dark'?'#1f1f1f':'#f5f5f5'}}.target{position:fixed;width:2px;height:2px;pointer-events:none}</style><span class="target" id="start" style="left:100px;top:90px"></span><span class="target" id="end" style="left:300px;top:180px"></span>`)
  await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>{(window as any).start()});await page.clock.runFor(650)
  const metrics=await page.locator('[data-home-guide-pointer] svg').evaluate((svg:SVGSVGElement)=>{const path=svg.querySelector('path')!,r=path.getBBox(),style=getComputedStyle(svg);return{width:svg.getAttribute('width'),height:svg.getAttribute('height'),fill:path.getAttribute('fill'),stroke:path.getAttribute('stroke'),strokeWidth:path.getAttribute('stroke-width'),opacity:path.getAttribute('stroke-opacity'),body:{width:r.width,height:r.height},origin:style.transformOrigin,shadow:style.filter}})
  expect(metrics).toMatchObject({width:'18',height:'20',fill:'#45474A',stroke:'#D7D8DA',strokeWidth:'1.35',opacity:'.92'});expect(metrics.body.width).toBeLessThan(14);expect(metrics.body.height).toBeLessThan(16);expect(metrics.origin).toBe('2.75px 2.5px');expect(metrics.shadow).toContain('1px 1.5px')
  await page.clock.runFor(1500);await page.evaluate(()=>(window as any).action)
  const frames=await page.evaluate(()=>(window as any).frames)
  expect(frames.some((frame:any)=>frame.phase==='pressed')).toBe(true);expect(frames.some((frame:any)=>frame.phase==='dragging')).toBe(true);expect(frames.some((frame:any)=>frame.phase==='released')).toBe(true)
  for(const frame of frames){expect(Math.abs(frame.x-frame.tip.x)).toBeLessThan(.02);expect(Math.abs(frame.y-frame.tip.y)).toBeLessThan(.02)}
  expect(await page.locator('[data-home-guide-pointer]').evaluate((node:HTMLElement)=>getComputedStyle(node).pointerEvents)).toBe('none')
  await page.screenshot({path:join(output,'pointer-'+mode+'-dpr'+dpr+'.png'),clip:{x:280,y:160,width:48,height:48}})
  await writeFile(join(output,'metrics-'+mode+'-dpr'+dpr+'.json'),JSON.stringify({metrics,frameCount:frames.length,maxHotspotError:Math.max(...frames.map((frame:any)=>Math.hypot(frame.x-frame.tip.x,frame.y-frame.tip.y)))},null,2)+'\n')
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('[data-home-guide-pointer] svg').evaluate((svg:SVGSVGElement)=>getComputedStyle(svg).transitionDuration)).toBe('0s')
 }finally{await page.close()}
},15000)
