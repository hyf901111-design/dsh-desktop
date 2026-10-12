// Hit-test real iframe boundaries in isolated Chromium with the production grid CSS.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {default:playwright}=await import(process.env.SHERLOCK_PLAYWRIGHT_MODULE ||
 '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
const css=await readFile(new URL('./lib/research-grid-workbench.css',import.meta.url),'utf8')
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_CHROMIUM_PATH ||
 '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try {
 const page=await browser.newPage({viewport:{width:900,height:600}})
 await page.setContent(`<style>
 .rScV5Q_previewBody{position:relative;width:600px;height:360px}
 iframe{border:0;width:100%;height:100%}
 .rScV5Q_previewShield{position:absolute;inset:0;z-index:2;pointer-events:none}
 </style><div data-ework-grid data-canvas-tool="select"><section class="rScV5Q_richNode" data-research-node-id="table" data-selected="false"><div class="rScV5Q_previewBody" data-research-preview-body><iframe data-research-html-artifact srcdoc="<table><tr><td>研究数据</td></tr></table>"></iframe><div class="rScV5Q_previewShield"></div></div></section></div>`)
 await page.addStyleTag({content:css})
 for(const [selected,expanded,expected] of [[false,false,'shield'],[true,false,'iframe'],[false,true,'iframe'],[false,false,'shield']]) {
  const result=await page.evaluate(({selected,expanded})=>{
   const card=document.querySelector('[data-research-node-id]');card.dataset.selected=String(selected);card.toggleAttribute('open',expanded)
   const r=card.querySelector('iframe').getBoundingClientRect(),target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)
   return target.matches('.rScV5Q_previewShield')?'shield':target.tagName.toLowerCase()
  },{selected,expanded})
  assert.equal(result,expected,`selected=${selected},expanded=${expanded}: unselected iframe wheel must reach the parent canvas`)
  console.log(JSON.stringify({selected,expanded,hitTarget:result}))
 }
} finally {await browser.close()}
