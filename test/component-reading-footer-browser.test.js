import {afterAll,beforeAll,expect,it} from 'vitest';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js';
let browser;
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
},20000);
it('keeps long table source notes scrollable without covering table rows',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'table',title:'规模明细',asOf:meta.asOf,note:meta.note,sources:[{label:'Tushare',url:'https://tushare.pro'}],columns:['名称','规模'],rows:[['甲',20],['乙',10]]})));
 const page=await browser.newPage({viewport:{width:380,height:420},colorScheme:'dark'});
 try{
  await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');await frame.locator('.component-reading-footer').waitFor();
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  expect(await frame.locator('body>footer.market-footer').isVisible()).toBe(false);
  await frame.getByText('口径与来源',{exact:true}).click();expect((await frame.locator('.component-reading-footer').boundingBox()).height).toBeLessThanOrEqual(169);
  expect(await frame.locator('tbody tr').count()).toBe(2);expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  const t=await frame.locator('.market-table-wrap').boundingBox(),f=await frame.locator('.component-reading-footer').boundingBox();expect(t.y+t.height).toBeLessThanOrEqual(f.y+1);
 }finally{await page.close();}
},20000);
afterAll(async()=>{await browser?.close();});
const meta={asOf:'2026-11-06 · 静态快照，自动更新未绑定',range:'2026-10-30 至 2026-11-06',note:'估算金额采用期末净值，缺失记录不补零。'.repeat(25),sources:[{name:'Tushare etf_share_size + etf_basic + trade_cal（ETF运营汇总 overview）',url:'https://tushare.pro/document/2?doc_id=408'}]};
it('keeps KPI footers compact in narrow and wide themed previews, with accessible full details and no duplicate refresh control',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'kpi',title:'周度规模概况',...meta,items:[{label:'期末规模',value:48632.81,unit:'亿元'},{label:'规模变化',value:3002.91,unit:'亿元'},{label:'份额变化',value:756.74,unit:'亿份'},{label:'净申购产品数',value:605,unit:'只'},{label:'净赎回产品数',value:808,unit:'只'},{label:'净流入估算',value:1623.19,unit:'亿元'}]})));
 for(const width of [320,480,880])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:640},colorScheme:theme});
  try{
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,theme,{workbench:true,notoFont:'runtime'}));
   const frame=page.frameLocator('iframe'),footer=frame.locator('.component-reading-footer');await footer.waitFor();
   expect((await footer.boundingBox()).height).toBeLessThanOrEqual(34);
   expect(await frame.locator('#indicator-refresh').isVisible()).toBe(false);expect(await frame.locator('.indicator-asof').isVisible()).toBe(false);
   expect(await footer.locator('dd').first().isVisible()).toBe(false);
   expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
   const tiles=await frame.locator('.indicator-tile').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}));
   for(let i=1;i<tiles.length;i++)if(tiles[i].top===tiles[i-1].top)expect(tiles[i].left).toBeGreaterThanOrEqual(tiles[i-1].right);
   if(width===880&&theme==='dark'){mkdirSync('output/research-quality/footer',{recursive:true});await page.screenshot({path:'output/research-quality/footer/kpi-compact.png'});}
   await footer.locator('summary').click();expect(await footer.locator('dd').first().isVisible()).toBe(true);expect(await footer.textContent()).toContain(meta.note);
   expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
   await footer.locator('summary').focus();await page.keyboard.press('Enter');expect(await footer.locator('dd').first().isVisible()).toBe(false);
  }finally{await page.close();}
 }
},30000);
it('folds chart methodology while leaving legend filtering and full data usable',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'bar',title:'净流入前列',asOf:meta.asOf,note:meta.note,unit:'亿元',labels:['甲','乙'],series:[{name:'净流入估算',values:[20,10]},{name:'对比期',values:[15,8]}]})));
 const page=await browser.newPage({viewport:{width:620,height:580}});
 try{
  await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');await frame.locator('.component-reading-footer').waitFor();
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  expect(await frame.locator('figcaption').isVisible()).toBe(false);
  await frame.getByText('查看完整数据',{exact:true}).click();await frame.locator('table').waitFor({state:'visible',timeout:2000});
  await frame.locator('[data-chart-series="0"]').click();expect(await frame.locator('[data-chart-series="0"]').getAttribute('aria-pressed')).toBe('false');
  await frame.getByText('口径与来源',{exact:true}).click();expect(await frame.locator('.component-reading-footer').textContent()).toContain(meta.note);
 }finally{await page.close();}
},20000);
