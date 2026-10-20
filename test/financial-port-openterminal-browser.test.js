import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {runInNewContext} from 'node:vm'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import {FinancialConnectionPort} from '../scripts/lib/financial-widget-link.mjs'
import {patchFinancialWidgetClient} from '../scripts/lib/financial-widget-client.mjs'
import {patchResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {financialLinkSourceId,financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

let browser,css
const Port=runInNewContext('('+FinancialConnectionPort.toString()+')',{react_jsx_runtime:jsx,financialLinkSourceId})
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const client=patchResearchGridWorkbench(patchFinancialWidgetClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 const emittedStyle=(begin,end)=>{
  const start=client.indexOf(begin),block=client.slice(start,client.indexOf(end,start))
  return JSON.parse(block.match(/style\.textContent=("(?:\\.|[^"\\])*")/)[1])
 }
 // Use the production patchers' CSS, including layered generic span/button
 // presentation rules and the current board's generated-component palette.
 css=emittedStyle('/* EWORK_GRID_WORKBENCH_BEGIN */','/* EWORK_GRID_WORKBENCH_END */')+'\n'+emittedStyle('/* EWORK_FINANCIAL_WIDGET_V1 */','/* EWORK_FINANCIAL_WIDGET_END */')
},30000)
afterAll(async()=>browser?.close())

async function fixture(deviceScaleFactor){
 const page=await browser.newPage({viewport:{width:1100,height:400},deviceScaleFactor,reducedMotion:'reduce'})
 const node={id:'quote',containerSpec:financialWidgetDefaults('quote')}
 const port=side=>renderToStaticMarkup(jsx.jsx(Port,{node,side,readOnly:false}))
 await page.setContent('<main data-research-canvas data-ework-grid data-workbench-style="dark"><article data-research-node-id="quote"><header class="ew-grid-header">个股行情</header><div data-research-preview-body><div class="rScV5Q_containerContent"><section class="ew-financial-widget" data-financial-widget="quote"><div class="fixture-content"></div><footer class="ew-financial-footer">'+port('input')+'<button class="ew-financial-provenance"><span>休市中</span><span class="ew-financial-source-time">腾讯财经 · 行情 10/19 16:14</span></button><span>获取 16:25</span>'+port('output')+'</footer></section></div></div></article></main>')
 await page.addStyleTag({content:css+'\nhtml,body{margin:0;height:100%} [data-research-canvas]{position:relative;margin:0!important;height:100%!important} [data-research-node-id]{position:absolute;display:flex;flex-direction:column;left:333.733px;top:80.2px;width:615.2px;height:140px}.fixture-content{flex:1;min-height:0}'})
 return page
}

async function metrics(page){
 return page.locator('.ew-financial-port').evaluateAll(ports=>ports.map(port=>{
  const dot=port.firstElementChild,p=port.getBoundingClientRect(),d=dot.getBoundingClientRect(),f=port.closest('footer').getBoundingClientRect(),button=getComputedStyle(port),point=getComputedStyle(dot),ring=getComputedStyle(port,'::after')
  const scale=ring.transform==='none'?1:new DOMMatrixReadOnly(ring.transform).a,ringWidth=parseFloat(ring.width)*scale,ringHeight=parseFloat(ring.height)*scale
  return {side:port.dataset.financialPort,button:{width:p.width,height:p.height,radius:button.borderRadius,cursor:button.cursor,background:button.backgroundColor},dot:{width:d.width,height:d.height,radius:point.borderRadius,borderStyle:point.borderStyle,pointerEvents:point.pointerEvents},ring:{width:ring.width,height:ring.height,radius:ring.borderRadius,opacity:Number(ring.opacity)},offset:{x:d.x+d.width/2-p.x-p.width/2,y:d.y+d.height/2-p.y-p.height/2},clearance:{left:d.left-f.left,right:f.right-d.right,top:d.top-f.top,bottom:f.bottom-d.bottom,ringLeft:p.x+p.width/2-ringWidth/2-f.left,ringRight:f.right-p.x-p.width/2-ringWidth/2,ringTop:p.y+p.height/2-ringHeight/2-f.top,ringBottom:f.bottom-p.y-p.height/2-ringHeight/2}}
 }))
}

it('pulses compatible off-pointer targets during a drag and stops on cancellation, while reduced motion stays static',async()=>{
 const page=await fixture(2)
 try{
  await page.emulateMedia({reducedMotion:'no-preference'})
  const inlet=page.locator('[data-financial-port=input]')
  const read=()=>inlet.evaluate(port=>{const ring=getComputedStyle(port,'::after');return{name:ring.animationName,iterations:ring.animationIterationCount,opacity:Number(ring.opacity),width:ring.width,height:ring.height}})
  expect((await read()).name).toBe('none')
  for(const style of ['light','dark','enterprise','openterminal']){
   await page.locator('[data-ework-grid]').evaluate((root,style)=>{root.dataset.workbenchStyle=style;root.setAttribute('data-financial-connecting','');root.querySelector('[data-financial-port=input]').setAttribute('data-drop-eligible','')},style)
   expect(await read()).toMatchObject({name:'ew-financial-port-available',iterations:'infinite',width:'16px',height:'16px'})
   expect(await page.locator('[data-financial-port=output]').evaluate(port=>getComputedStyle(port,'::after').animationName)).toBe('none')
   const samples=await inlet.evaluate(port=>{
    const animation=port.getAnimations({subtree:true}).find(a=>a.animationName==='ew-financial-port-available')
    if(!animation)return null
    animation.pause();animation.currentTime=0;const first=Number(getComputedStyle(port,'::after').opacity)
    animation.currentTime=900;return[first,Number(getComputedStyle(port,'::after').opacity)]
   })
   expect(samples).not.toBeNull();expect(samples[0]).toBeGreaterThan(samples[1])
   await page.locator('[data-ework-grid]').evaluate(root=>{root.removeAttribute('data-financial-connecting');root.querySelector('[data-financial-port=input]').removeAttribute('data-drop-eligible')})
   expect((await read()).name).toBe('none')
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.locator('[data-ework-grid]').evaluate(root=>{root.setAttribute('data-financial-connecting','');root.querySelector('[data-financial-port=input]').setAttribute('data-drop-eligible','')})
  expect(await read()).toMatchObject({name:'none',opacity:.55})
 }finally{await page.close()}
})

// Catch theme-wide square-control rules accidentally restyling the native
// connection hit target, including at the fractional positions used by grids.
it('keeps native connection targets and their circular dots/rings intact in every workbench style at DPR 1 and 2',async()=>{
 for(const dpr of [1,2]){
  const page=await fixture(dpr)
  try{
   for(const style of ['light','dark','enterprise','openterminal']){
    await page.locator('[data-ework-grid]').evaluate((root,style)=>root.dataset.workbenchStyle=style,style)
    for(const state of ['idle','hover','focus','connected','drop-target']){
     await page.mouse.move(0,0)
     await page.evaluate(()=>{document.activeElement?.blur();for(const port of document.querySelectorAll('.ew-financial-port')){port.removeAttribute('data-connected');port.removeAttribute('data-drop-target');port.removeAttribute('aria-pressed')}})
     if(state==='hover')await page.locator('[data-financial-port=input]').hover()
     if(state==='focus')await page.locator('[data-financial-port=input]').focus()
     if(state==='connected')await page.locator('.ew-financial-port').evaluateAll(ports=>ports.forEach(port=>port.dataset.connected='true'))
     if(state==='drop-target')await page.locator('[data-financial-port=input]').evaluate(port=>{port.setAttribute('data-drop-target','');port.setAttribute('aria-pressed','true')})
     const values=await metrics(page)
     expect(values.map(value=>value.side)).toEqual(['input','output'])
     for(const value of values){
      const label=JSON.stringify({dpr,style,state,side:value.side})
      expect(value.button,label).toEqual({width:20,height:20,radius:'4px',cursor:'crosshair',background:'rgba(0, 0, 0, 0)'})
      expect(value.dot,label).toEqual({width:state==='drop-target'&&value.side==='input'?11.5:10,height:state==='drop-target'&&value.side==='input'?11.5:10,radius:'50%',borderStyle:'solid',pointerEvents:'none'})
      expect(value.ring.width,label).toBe('16px');expect(value.ring.height,label).toBe('16px');expect(value.ring.radius,label).toBe('50%')
      expect(Math.abs(value.offset.x),label).toBeLessThanOrEqual(.02);expect(Math.abs(value.offset.y),label).toBeLessThanOrEqual(.02)
      for(const clearance of Object.values(value.clearance))expect(clearance,label).toBeGreaterThan(0)
     }
     expect(await page.locator('.ew-financial-provenance').isVisible()).toBe(true)
    }
   }
  }finally{await page.close()}
 }
},20000)
