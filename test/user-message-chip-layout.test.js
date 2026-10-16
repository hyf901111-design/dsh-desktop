import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {expect,it} from 'vitest'

it('keeps reference labels and adjacent user text on the same baseline without preventing wrapping',async()=>{
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 const browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 try{
  const page=await browser.newPage({viewport:{width:600,height:400}})
  await page.setContent('<div class="gdEzaW_bubble" style="width:320px"><span class="gdEzaW_refChip" data-ref-chip="skill">/ework-workbench-components</span><span class="message">你好 Hello</span><span> 这是一段可以自然换行的内容，保留正文原有的内联阅读和段落排版。</span></div>')
  await page.addStyleTag({content:await readFile('src/preload/figma-inline-references.css','utf8')})
  const result=await page.evaluate(()=>{const chip=document.querySelector('[data-ref-chip]'),text=document.querySelector('.message'),bubble=document.querySelector('.gdEzaW_bubble');const rect=element=>{const r=document.createRange();r.selectNodeContents(element);return r.getBoundingClientRect()};return {chipBottom:rect(chip).bottom,textBottom:rect(text).bottom,overflow:bubble.scrollWidth>bubble.clientWidth}})
  expect(Math.abs(result.chipBottom-result.textBottom)).toBeLessThanOrEqual(1.5);expect(result.overflow).toBe(false)
 }finally{await browser.close()}
},15000)
