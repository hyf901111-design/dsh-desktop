import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { creationToolsCss, marqueeScreenStyle, patchCanvasCreationTools } from '../scripts/lib/canvas-creation-tools.mjs'
const installed = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const base = installed.match(/\.rScV5Q_marquee\{[^}]+\}/)[0]
let browser
beforeAll(async () => {
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async () => { await browser?.close() })
it('updates installed and fresh marquee renderers idempotently', () => {
  const patched = patchCanvasCreationTools(installed)
  expect(patchCanvasCreationTools(patched).trim()).toBe(patched.trim())
  expect(patched).toContain('/* ODYSSEY_MARQUEE_SCREEN_PIXELS */')
})
for (const dpr of [1, 1.25, 2]) for (const component of [false, true]) it(`paints all four ${component ? 'component' : 'selection'} edges blue at DPR ${dpr}`, async () => {
  const page = await browser.newPage({viewport:{width:720,height:580},deviceScaleFactor:dpr})
  try {
    await page.setContent(`<style>body{margin:0;background:#242424;--dsw-alias-state-business-primary:#0d99ff}${base}${creationToolsCss}</style><div data-research-canvas style="position:absolute;left:91.33px;top:67.25px;width:560px;height:470px"><div class="rScV5Q_marquee" data-research-marquee ${component ? 'data-research-component-marquee' : ''}></div></div>`)
    const rect = await page.evaluate(({source}) => {
      const style = (0,eval)('('+source+')')({left:43.19,top:39.41,width:391.27,height:317.39},document.querySelector('[data-research-canvas]'))
      const el = document.querySelector('[data-research-marquee]')
      for (const [key,value] of Object.entries(style)) key.startsWith('--') ? el.style.setProperty(key,value) : el.style[key]=value+'px'
      const r=el.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}
    }, {source:marqueeScreenStyle.toString()})
    const png=(await page.screenshot()).toString('base64')
    const counts=await page.evaluate(async ({png,rect,dpr})=>{
      const img=new Image();img.src='data:image/png;base64,'+png;await img.decode()
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
      const l=Math.round(rect.left*dpr),r=Math.round(rect.right*dpr)-1,t=Math.round(rect.top*dpr),b=Math.round(rect.bottom*dpr)-1
      const sides=[Array.from({length:b-t-8},(_,i)=>[l,t+4+i]),Array.from({length:b-t-8},(_,i)=>[r,t+4+i]),Array.from({length:r-l-8},(_,i)=>[l+4+i,t]),Array.from({length:r-l-8},(_,i)=>[l+4+i,b])]
      return sides.map((points,side)=>points.filter(([x,y])=>Array.from({length:7},(_,i)=>i-3).some(offset=>{const p=ctx.getImageData(x+(side<2?offset:0),y+(side<2?0:offset),1,1).data;return Math.abs(p[0]-13)<=2&&Math.abs(p[1]-153)<=2&&Math.abs(p[2]-255)<=2})).length/points.length)
    },{png,rect,dpr})
    // Dashed edges have gaps; each side must still contain fully saturated blue.
    for (const count of counts) expect(count, JSON.stringify({rect,counts})).toBeGreaterThan(component ? .95 : .35)
  } finally { await page.close() }
})
