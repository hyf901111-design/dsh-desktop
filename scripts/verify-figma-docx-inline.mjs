import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import playwright from '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
import {filePreviewCss} from './lib/figma-file-preview-client.mjs'
const browser=await playwright.chromium.launch({executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try{
const page=await browser.newPage({viewport:{width:1100,height:900}})
await page.setContent(`<style>body{margin:20px}dialog{position:static;display:block;margin:0;padding:0;border:0;width:318px;height:164px;overflow:hidden}.editorDocxViewport{overflow:auto;height:100%;display:flex}.editorDocxWrap{padding:16px;width:100%;flex:none}.docx-wrapper{background:gray;padding:30px;display:flex;flex-direction:column;align-items:center}section.docx{box-sizing:border-box;flex:none;width:816px;min-height:1056px;padding:96px 120px;background:white}h1{font:24px/28px sans-serif;margin:0 0 12px}p{font:14px/20px sans-serif;margin:0}</style><style>${filePreviewCss}</style><dialog data-research-file-presentation="docx"><div class="odyssey-file-reader" data-research-original-reader><div class="editorDocxViewport"><div class="editorDocxWrap" style="zoom:1"><div class="docx-wrapper"><section class="docx"><h1>Quarterly report</h1><p>Revenue 120. Growth 8.5%.</p></section></div></div></div></div></dialog>`)
const measure=()=>page.evaluate(()=>{const d=document.querySelector('dialog'),p=document.querySelector('p'),h=document.querySelector('h1'),s=document.querySelector('section');return{card:d.getBoundingClientRect().toJSON(),paragraph:p.getBoundingClientRect().toJSON(),title:h.getBoundingClientRect().toJSON(),font:getComputedStyle(p).fontSize,page:s.getBoundingClientRect().toJSON(),padding:getComputedStyle(s).padding}})
const compact=await measure();assert(compact.title.left>=compact.card.left);assert(compact.paragraph.right<=compact.card.right);assert(compact.paragraph.bottom<=compact.card.bottom);assert.equal(compact.font,'14px')
await mkdir('output/figma-file-preview-20260910',{recursive:true});await page.screenshot({path:'output/figma-file-preview-20260910/docx-compact-reflow.png'})
await page.evaluate(()=>{const d=document.querySelector('dialog');d.setAttribute('open','');d.style.width='1000px';d.style.height='800px'})
const expanded=await measure();assert.equal(expanded.page.width,816);assert.equal(expanded.padding,'96px 120px');assert.equal(expanded.font,compact.font)
console.log('PASS: Word compact preview shows title/body without font shrinking; expanded document retains original page dimensions and margins')
}finally{await browser.close()}
