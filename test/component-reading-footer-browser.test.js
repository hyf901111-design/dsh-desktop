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
  expect(await frame.locator('.component-reading-footer dd').first().isVisible()).toBe(true);expect((await frame.locator('.component-reading-footer').boundingBox()).height).toBeLessThanOrEqual(241);
  expect(await frame.locator('tbody tr').count()).toBe(2);expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  const t=await frame.locator('.market-table-wrap').boundingBox(),f=await frame.locator('.component-reading-footer').boundingBox();expect(t.y+t.height).toBeLessThanOrEqual(f.y+1);
 }finally{await page.close();}
},20000);
afterAll(async()=>{await browser?.close();});
it('keeps real date labels readable when resizing a chart with expanded details',async()=>{
 const labels=Array.from({length:60},(_,i)=>new Date(Date.UTC(2026,7,7+i)).toISOString().slice(0,10));
 for(const axisDecimals of [undefined,2]){
  const page=await browser.newPage({viewport:{width:566,height:650}});page.setDefaultTimeout(3000);
  try{
   const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'line',title:'三指数对比',unit:'基期=100',...(axisDecimals===undefined?{}:{axisDecimals}),labels,series:[{name:'指数甲',values:labels.map((_,i)=>100-i/3)},{name:'指数乙',values:labels.map((_,i)=>100+i/4)}],note:'各序列以首日为100。'})));
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');await frame.getByRole('tab',{name:'完整数据'}).waitFor();
   await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
   for(const width of [320,566,880]){
    await page.setViewportSize({width,height:650});await page.waitForTimeout(120);
    const ticks=await frame.locator('svg text').evaluateAll(nodes=>nodes.filter(el=>el.querySelector('title')&&getComputedStyle(el).visibility!=='hidden').map(el=>{const r=el.getBBox();return{label:el.querySelector('title').textContent,left:r.x,right:r.x+r.width}}));
    expect(ticks[0].label).toBe(labels[0]);expect(ticks.at(-1).label).toBe(labels.at(-1));
    for(let i=1;i<ticks.length;i++)expect(ticks[i].left-ticks[i-1].right).toBeGreaterThanOrEqual(8);
    expect(ticks[0].left).toBeGreaterThanOrEqual(0);expect(ticks.at(-1).right).toBeLessThanOrEqual(width-24);
    expect(await frame.locator('tbody tr').count()).toBe(60);expect(await frame.locator('circle[data-point]').count()).toBe(120);
    expect(await frame.locator('table').isVisible()).toBe(true);
   }
   await frame.locator('svg').focus();await page.keyboard.press('End');expect(await frame.locator('.chart-readout').textContent()).toContain(labels.at(-1));
  }finally{await page.close();}
 }
},15000);
it('ignores relative legacy disclosure clicks while preserving explicit new open states',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'horizontal',title:'保存的排名',unit:'亿元',note:'完整口径',labels:['甲','乙'],series:[{name:'估算',values:[20,10]}]})));
 const page=await browser.newPage({viewport:{width:566,height:360}});
 try{
  await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');
  await frame.getByRole('tab',{name:'完整数据'}).waitFor();
  const routes=await frame.locator('body>details>summary,.component-reading-footer>details>summary').evaluateAll(nodes=>nodes.map(el=>{const route=[];for(let e=el;e!==document.body;e=e.parentElement)route.unshift([...e.parentElement.children].indexOf(e));return route;}));
  const events=Object.fromEntries(routes.map((targetRoute,i)=>['saved-'+i,{id:'saved-'+i,clock:i+1,targetRoute,tag:'SUMMARY',type:'click'}]));
  await page.evaluate(events=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events},readOnly:false},'*'),events);
  await page.waitForTimeout(200);
  expect(await frame.getByRole('tab',{name:'完整数据'}).getAttribute('aria-selected')).toBe('true');
  expect(await frame.locator('table').isVisible()).toBe(true);
  expect(await frame.locator('.component-reading-footer dd').isVisible()).toBe(false);
  events.close={id:'close',clock:3,targetRoute:routes[0],tag:'SUMMARY',type:'click',checked:false};
  await page.evaluate(events=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events},readOnly:false},'*'),events);
  await expect.poll(()=>frame.locator('table').isVisible()).toBe(false);
  events.source={id:'source',clock:4,targetRoute:routes[1],tag:'SUMMARY',type:'click',checked:true};
  await page.evaluate(events=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events},readOnly:false},'*'),events);
  await expect.poll(()=>frame.getByRole('tab',{name:'口径与来源'}).getAttribute('aria-selected')).toBe('true');
  expect(await frame.locator('.component-reading-footer dd').isVisible()).toBe(true);
  expect(await frame.locator('.component-reading-toggle').evaluate(el=>getComputedStyle(el,'::before').content)).toBe('""');
  expect(await frame.locator('.component-reading-toggle').evaluate(el=>getComputedStyle(el,'::before').borderRightStyle)).toBe('solid');
 }finally{await page.close();}
},15000);
it('keeps chart detail entries visible together at the real compact card height',async()=>{
 const labels=['华泰柏瑞沪深300ETF','华夏上证科创板50成份ETF','南方中证1000ETF','南方中证500ETF','易方达创业板ETF'];
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'horizontal',title:'ETF流入前五',unit:'亿元',asOf:'2026-10-30 至 2026-11-06',note:'估算金额为份额变动乘以期末净值。',labels,series:[{name:'净流入估算',values:[321.13,234,216.07,199.55,182.89]}],detailColumns:['产品','代码'],detailRows:labels.map((label,i)=>[label,String(i)]),sources:[{label:'Tushare',url:'https://tushare.pro'}]})));
 const page=await browser.newPage({viewport:{width:566,height:303}});page.setDefaultTimeout(3000);
 try{
  await page.setContent('<script>window.detailSizes=[];addEventListener("message",event=>{if(event.data?.type==="sherlock-workbench-content-size")window.detailSizes.push(event.data)})</script>'+buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');
  await frame.locator('.component-reading-footer').waitFor();
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  expect(await frame.locator('table').isVisible()).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.detailSizes.at(-1)?.height||0)).toBeGreaterThan(303);
  // Simulate host fitting while font/layout measurements settle.
  let fittedHeight;
  for(let i=0;i<3;i++){fittedHeight=await page.evaluate(()=>window.detailSizes.at(-1).height);await page.setViewportSize({width:566,height:fittedHeight});await page.waitForTimeout(250);}
  expect(fittedHeight).toBeLessThan(650);
  await expect.poll(()=>frame.locator('body').evaluate(el=>el.scrollHeight<=innerHeight+1)).toBe(true);
  await page.waitForTimeout(550);
  expect(await page.evaluate(()=>window.detailSizes.at(-1).height)).toBe(fittedHeight);
  const entries=await frame.getByRole('tab').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}));
  expect(entries).toHaveLength(2);expect(Math.abs(entries[0].top-entries[1].top)).toBeLessThanOrEqual(3);
  for(const entry of entries)expect(entry.bottom).toBeLessThanOrEqual(fittedHeight);
  expect((await frame.locator('svg').boundingBox()).height).toBeGreaterThanOrEqual(160);
  const dataTab=frame.getByRole('tab',{name:'完整数据'}),sourceTab=frame.getByRole('tab',{name:'口径与来源'});
  expect(await frame.locator('tbody tr').count()).toBe(5);
  expect(await frame.locator('.data-scroll').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  const expanded=await sourceTab.boundingBox();expect(Math.abs(expanded.y-entries[1].top)).toBeLessThanOrEqual(1);
  await sourceTab.click();expect(await frame.locator('.component-reading-footer dd').first().isVisible()).toBe(true);
  expect(await frame.locator('table').isVisible()).toBe(false);expect(await sourceTab.getAttribute('aria-selected')).toBe('true');
  await sourceTab.focus();await page.keyboard.press('ArrowLeft');expect(await dataTab.getAttribute('aria-selected')).toBe('true');
  expect(await frame.locator('table').isVisible()).toBe(true);expect(await frame.locator('.component-reading-footer dd').first().isVisible()).toBe(false);
  await frame.getByRole('button',{name:'收起组件详情'}).click();expect(await frame.locator('table').isVisible()).toBe(false);
  expect(await frame.getByRole('button',{name:'展开组件详情'}).getAttribute('aria-expanded')).toBe('false');
  await expect.poll(()=>frame.locator('body').evaluate(el=>el.scrollHeight<=innerHeight+1)).toBe(true);
 }finally{await page.close();}
},15000);
const meta={asOf:'2026-11-06 · 静态快照，自动更新未绑定',range:'2026-10-30 至 2026-11-06',note:'估算金额采用期末净值，缺失记录不补零。'.repeat(25),sources:[{name:'Tushare etf_share_size + etf_basic + trade_cal（ETF运营汇总 overview）',url:'https://tushare.pro/document/2?doc_id=408'}]};
it('keeps KPI footers compact in narrow and wide themed previews, with accessible full details and no duplicate refresh control',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'kpi',title:'周度规模概况',...meta,items:[{label:'期末规模',value:48632.81,unit:'亿元'},{label:'规模变化',value:3002.91,unit:'亿元'},{label:'份额变化',value:756.74,unit:'亿份'},{label:'净申购产品数',value:605,unit:'只'},{label:'净赎回产品数',value:808,unit:'只'},{label:'净流入估算',value:1623.19,unit:'亿元'}]})));
 for(const width of [320,480,880])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:640},colorScheme:theme});
  try{
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,theme,{workbench:true,notoFont:'runtime'}));
   const frame=page.frameLocator('iframe'),footer=frame.locator('.component-reading-footer');await footer.waitFor();
   expect((await footer.boundingBox()).height).toBeLessThanOrEqual(241);
   expect(await frame.locator('#indicator-refresh').isVisible()).toBe(false);expect(await frame.locator('.indicator-asof').isVisible()).toBe(false);
   expect(await footer.locator('dd').first().isVisible()).toBe(true);
   expect(await frame.locator('.indicator-tile').evaluateAll(nodes=>nodes.every(el=>el.open))).toBe(true);
   expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
   const tiles=await frame.locator('.indicator-tile').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}));
   for(let i=1;i<tiles.length;i++)if(tiles[i].top===tiles[i-1].top)expect(tiles[i].left).toBeGreaterThanOrEqual(tiles[i-1].right);
   if(width===880&&theme==='dark'){mkdirSync('output/research-quality/footer',{recursive:true});await page.screenshot({path:'output/research-quality/footer/kpi-compact.png'});}
   expect(await footer.locator('dd').first().isVisible()).toBe(true);expect(await footer.textContent()).toContain(meta.note);
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
  await frame.getByRole('tab',{name:'完整数据'}).click();await frame.locator('table').waitFor({state:'visible',timeout:2000});
  await frame.locator('[data-chart-series="0"]').click();expect(await frame.locator('[data-chart-series="0"]').getAttribute('aria-pressed')).toBe('false');
  await frame.getByRole('tab',{name:'口径与来源'}).click();expect(await frame.locator('.component-reading-footer').textContent()).toContain(meta.note);
 }finally{await page.close();}
},20000);
it('opens supplemental chart data by default and supports compact sortable resizable detail tables',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'horizontal',title:'净流入前列',asOf:meta.asOf,note:meta.note,unit:'亿元',labels:['甲','乙'],series:[{name:'净流入估算',values:[20,10]}],detailColumns:['产品','代码','规模（亿元）','管理人'],detailRows:[['甲','001',120,'甲基金'],['乙','002',null,'乙基金']],sources:[{label:'Tushare',url:'https://tushare.pro'}]})));
 for(const width of [360,880])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:680},colorScheme:theme});page.setDefaultTimeout(3000);
  try{
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,theme,{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');
   await frame.locator('.component-reading-footer').waitFor();
   await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
   expect(await frame.locator('table').isVisible()).toBe(true);
   expect((await frame.locator('.component-reading-tabs').boundingBox()).height).toBeLessThanOrEqual(40);
   const tabStyle=await frame.getByRole('tab',{name:'完整数据'}).evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,padding:parseFloat(s.paddingLeft),radius:parseFloat(s.borderRadius)};});
   expect(tabStyle.background).not.toBe('rgba(0, 0, 0, 0)');expect(tabStyle.padding).toBeGreaterThanOrEqual(8);expect(tabStyle.radius).toBeGreaterThanOrEqual(4);
   await frame.getByRole('tab',{name:'完整数据'}).click();await frame.locator('table').waitFor({state:'visible'});
   expect(await frame.locator('tbody tr').allTextContents()).toEqual(['甲20001120甲基金','乙10002—乙基金']);
   const header=frame.locator('thead th').nth(1);await header.locator('button').click();
   expect(await header.getAttribute('aria-sort')).toBe('ascending');expect(await frame.locator('tbody tr').first().textContent()).toContain('乙10');
   expect(await header.locator('button').evaluate(el=>getComputedStyle(el,'::after').content)).toContain('↑');
   await header.locator('button').click();expect(await header.getAttribute('aria-sort')).toBe('descending');expect(await frame.locator('tbody tr').first().textContent()).toContain('甲20');
   const sizeHeader=frame.locator('thead th').nth(3);await sizeHeader.locator('button').click();expect(await frame.locator('tbody tr').last().textContent()).toContain('乙10');
   await sizeHeader.locator('button').click();expect(await frame.locator('tbody tr').last().textContent()).toContain('乙10');
   expect(await frame.locator('.chart-readout').textContent()).toContain('甲');
   expect((await header.boundingBox()).height).toBeLessThanOrEqual(28);
   const handle=frame.locator('[data-workbench-column-resize="0"]');const start=Number(await handle.getAttribute('aria-valuenow'));
   const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+45,box.y+box.height/2,{steps:5});await page.mouse.up();
   expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(start+30);
   expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
   await frame.getByRole('button',{name:'收起组件详情'}).click();expect(await frame.locator('table').isVisible()).toBe(false);
  }finally{await page.close();}
 }
},30000);
it('centers single and wrapped readouts and keeps the detail switch separate from its collapse action',async()=>{
 for(const width of [320,600])for(const theme of ['light','dark']){
  const labels=['沪深300','沪深300、中证500和创业板指数的近三个月区间涨跌幅及对照结果'];
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'horizontal',title:'收益对比',unit:'%',note:'以共同区间的实际收盘数据计算。',labels,series:[{name:'区间涨跌幅',values:[-13.64,-17.33]}]})));
  const page=await browser.newPage({viewport:{width,height:640},colorScheme:theme});
  try{
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,theme,{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');
   await frame.getByRole('tab',{name:'完整数据'}).waitFor();
   await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
   const group=await frame.getByRole('tablist').boundingBox(),toggle=await frame.getByRole('button',{name:'收起组件详情'}).boundingBox();
   expect(toggle.x).toBeGreaterThanOrEqual(group.x+group.width+12);expect(Math.abs(toggle.y+toggle.height/2-group.y-group.height/2)).toBeLessThan(1);
   for(const key of ['Home','End']){
    await frame.locator('svg').focus();await page.keyboard.press(key);
    const balance=await frame.locator('.chart-readout').evaluate(el=>{const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();return {above:t.top-r.top,below:r.bottom-t.bottom,height:r.height,scroll:el.scrollWidth,client:el.clientWidth};});
    expect(Math.abs(balance.above-balance.below)).toBeLessThanOrEqual(2);expect(balance.height).toBeGreaterThanOrEqual(32);expect(balance.scroll).toBeLessThanOrEqual(balance.client+1);
   }
   const beforeSwitch=await frame.getByRole('tablist').boundingBox();
   await frame.getByRole('tab',{name:'口径与来源'}).click();expect(await frame.locator('dl[role=tabpanel]').isVisible()).toBe(true);
   const after=await frame.getByRole('tablist').boundingBox();expect(Math.abs(after.y-beforeSwitch.y)).toBeLessThan(1);
   await frame.getByRole('button',{name:'收起组件详情'}).click();expect(await frame.locator('dl[role=tabpanel]').isVisible()).toBe(false);
   await frame.getByRole('button',{name:'展开组件详情'}).focus();await page.keyboard.press('Enter');expect(await frame.locator('dl[role=tabpanel]').isVisible()).toBe(true);
  }finally{await page.close();}
 }
},20000);
