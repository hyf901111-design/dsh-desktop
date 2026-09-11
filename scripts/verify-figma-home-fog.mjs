// Controlled Chromium acceptance of the actual procedural renderer and CSS.
// Native package acceptance is separate; this fixture never touches user data.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
const chromium = playwright.chromium ?? playwright.default.chromium
const output = resolve(process.env.HOME_FLOW_OUTPUT || '/tmp/ework-silk-verification')
await mkdir(output, { recursive: true })
const bundle = (await build({ entryPoints:['src/preload/home-flow.ts'], bundle:true, format:'iife', globalName:'HomeFlow', write:false })).outputFiles[0].text
const css = await readFile('src/preload/figma-home.css','utf8')
assert(!/figma-glass-.*\.png/.test(css))
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
const results=[]
try {
 for(const theme of ['dark','light']) for(const viewport of [{width:1380,height:900},{width:1000,height:1300}]) {
  const page=await browser.newPage({viewport})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',r=>{throw Error('Unexpected background asset request: '+r.request().url())})
  await page.setContent(`<style>html,body{margin:0;height:100%;overflow:hidden}body{background:#888}.pI_x6G_centerCol{position:absolute;left:280px;top:10px;width:calc(100% - 292px);height:calc(100% - 20px);isolation:isolate;overflow:hidden}.wSkVaW_root{position:absolute;inset:0}#front{position:absolute;top:45%;left:15%;width:70%;height:126px;background:#2228;border-radius:12px;color:white;text-align:center;display:grid;place-content:center;font:24px sans-serif}</style><style>${css}</style><body ${theme==='dark'?'data-ds-dark-theme':''}><main class=pI_x6G_centerCol><section class=wSkVaW_root data-odyssey-page=home><div id=front>探索更远，洞见更深</div></section></main></body>`)
  await page.evaluate(()=>{let id=0;const pending=new Map();window.requestAnimationFrame=cb=>{pending.set(++id,cb);return id};window.cancelAnimationFrame=id=>pending.delete(id);window.step=t=>{const a=[...pending.values()];pending.clear();a.forEach(cb=>cb(t))};window.pending=()=>pending.size})
  await page.addScriptTag({content:bundle+';window.disposeFlow=HomeFlow.mountHomeFlow(document)'})
  const snapshots=[],durations=[]
  let data
  for(const seconds of [0,4,8,12]) {
    const frame=await page.evaluate(seconds=>{
      const c=document.querySelector('canvas'),ctx=c.getContext('2d'),front=document.querySelector('#front')
      window.flowDurations??=[]
      const first=seconds===0?1:(seconds-4)*24+2,last=seconds*24+1
      for(let i=first;i<=last;i++){const start=performance.now();window.step(i*1000/24+1);window.flowDurations.push(performance.now()-start)}
      return {pixels:[...ctx.getImageData(0,0,c.width,c.height).data],geometry:JSON.stringify(front.getBoundingClientRect()),width:c.width,height:c.height,transform:getComputedStyle(c).transform,filter:getComputedStyle(c).filter,canvasGeometry:JSON.stringify(c.getBoundingClientRect()),hostGeometry:JSON.stringify(c.parentElement.getBoundingClientRect()),durations:window.flowDurations}
    },seconds)
    assert.equal(frame.filter,'none');assert.equal(frame.canvasGeometry,frame.hostGeometry);snapshots.push(frame.pixels)
    data={geometry:data?.geometry??frame.geometry,after:frame.geometry,width:frame.width,height:frame.height,transform:frame.transform}
    durations.splice(0,durations.length,...frame.durations)
    await page.screenshot({path:output+`/${theme}-${viewport.width}-${seconds}s.png`})
  }
  Object.assign(data,{snapshots,maxFrameMs:Math.max(...durations),averageFrameMs:durations.reduce((a,b)=>a+b)/durations.length})
  assert.equal(data.geometry,data.after);assert.equal(data.transform,'none');assert(data.width<=256&&data.height<=256)
  for(const pixels of data.snapshots)for(let i=0;i<pixels.length;i+=4){assert.equal(pixels[i],pixels[i+1]);assert.equal(pixels[i],pixels[i+2]);assert.equal(pixels[i+3],255)}
  const change=data.snapshots[0].reduce((s,v,i)=>s+(i%4===0?Math.abs(v-data.snapshots[2][i]):0),0)/(data.width*data.height)
  assert(change>(theme==='dark'?.5:.15),'local fog must slowly deform over eight seconds')
  assert(change<(theme==='dark'?12:7),'fog motion must remain restrained')
  await page.screenshot({path:output+`/${theme}-${viewport.width}.png`})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.waitForFunction(()=>window.pending()===0,null,{polling:50})
  const paused=await page.evaluate(()=>{const c=document.querySelector('canvas');const before=c.toDataURL();window.step(50000);return before===c.toDataURL()})
  assert(paused)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.waitForFunction(()=>window.pending()===1,null,{polling:50})
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
  assert.equal(await page.evaluate(()=>window.pending()),0)
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));document.querySelector('section').dataset.odysseyPage='research'})
  await page.waitForFunction(()=>!document.querySelector('canvas'),null,{polling:50})
  assert.equal(await page.evaluate(()=>window.pending()),0)
  await page.evaluate(()=>{document.querySelector('section').dataset.odysseyPage='home'})
  await page.waitForFunction(()=>document.querySelectorAll('canvas').length===1,null,{polling:50})
  await page.evaluate(()=>window.disposeFlow())
  assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(errors,[])
  delete data.snapshots
  results.push({theme,viewport,change,...data,visibilityPause:true,reducedMotionPause:true,routeCleanup:true})
  await page.close()
 }
 await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))
}finally{await browser.close()}
