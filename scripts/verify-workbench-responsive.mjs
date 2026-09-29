// Focused layout checks for host templates; no user profile or business data.
// Generate fixtures with component-template-gallery.mjs <directory> --workbench.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
const directory=resolve(process.argv[2]),output=resolve(process.argv[3]??join(directory,'checks'))
await mkdir(output,{recursive:true})
const templates=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'))
const module=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href),playwright=module.default??module
const browser=await playwright.chromium.launch({executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
const results=[]
try{
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  const path=new URL(route.request().url()).pathname.slice(1)
  if(!/^[\w.-]+$/.test(path))return route.abort()
  try{await route.fulfill({contentType:path.endsWith('.js')?'text/javascript':'text/html',body:await readFile(join(directory,path))})}catch{await route.abort()}
 })
 for(const t of templates)for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme})
  await page.goto('https://responsive.fixture/'+t.id+'-'+theme+'.html')
  const frame=t.specType==='html'?await page.locator('#preview').elementHandle().then(e=>e.contentFrame()):page.mainFrame()
  await frame.locator('body').waitFor({state:'attached'})
  for(const width of [280,360,440,656]){
   await page.setViewportSize({width,height:Math.max(t.height,320)})
   const state=await frame.evaluate(async()=>{
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
    const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'}
    const scrollable=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll/.test(s.overflowX)&&p.scrollWidth>p.clientWidth+2)return true}return false}
    const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1
    const controls=[...document.querySelectorAll('input,select,button')].filter(visible)
    const clipped=controls.filter(e=>!scrollable(e)&&(rect(e).right>innerWidth+2||rect(e).x< -2)).map(e=>e.textContent||e.getAttribute('placeholder'))
    const feeds=[...document.querySelectorAll('.research-feed-item')].filter(visible).map(e=>{const meta=e.querySelector('.feed-meta'),copy=e.querySelector('.feed-copy'),title=copy?.querySelector('h2');return {meta:rect(meta),copy:rect(copy),title:title?.textContent,overlap:overlap(rect(meta),rect(copy))||[...meta.children].some(child=>overlap(rect(child),rect(copy))),metaOverflow:meta.scrollWidth>meta.clientWidth+2}})
    const metrics=[...document.querySelectorAll('.market-metric,.research-metric,.fund-kpi,.rScV5Q_containerKpis>div')].filter(visible).map(rect)
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,clipped,feeds,metricOverlap:metrics.some((a,i)=>metrics.slice(i+1).some(b=>overlap(a,b))),text:document.body.innerText.length}
   })
   results.push({id:t.id,theme,...state})
   if(['news','reports','market.metrics','dashboard','kpi','market.candlestick'].includes(t.id)&&width===360)await page.screenshot({path:join(output,t.id+'-'+theme+'-360.png')})
  }
 }
 await writeFile(join(output,'report.json'),JSON.stringify({templates:templates.length,results,errors},null,2))
 assert.deepEqual(errors,[],'rendering errors')
 const failures=results.filter(s=>s.scrollWidth>s.width+2||s.clipped.length||s.feeds.some(f=>f.overlap||f.metaOverflow)||s.metricOverlap)
 assert.deepEqual(failures,[],'controls, feed metadata and metrics must remain inside available layout without overlap')
 console.log(JSON.stringify({pass:true,templates:templates.length,renderings:results.length,widths:[280,360,440,656],themes:['light','dark'],output},null,2))
}finally{await browser.close()}
