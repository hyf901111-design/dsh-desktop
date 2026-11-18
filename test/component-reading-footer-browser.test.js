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
  await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');await frame.locator('.component-reading-footer').waitFor({state:'attached'});
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  expect(await frame.locator('body>footer.market-footer').isVisible()).toBe(false);
  expect(await frame.locator('.component-reading-footer').isVisible()).toBe(false);expect(await frame.locator('.component-reading-footer').textContent()).toContain(meta.note);
  expect(await frame.locator('tbody tr').count()).toBe(2);expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await frame.locator('.market-table-wrap').isVisible()).toBe(true);
 }finally{await page.close();}
},20000);
afterAll(async()=>{await browser?.close();});
it('shows the plot and selected value before opening complete exchange-rate data',async()=>{
 const labels=Array.from({length:16},(_,i)=>'2026-11-'+String(i+1).padStart(2,'0'));
 const values=labels.map((_,i)=>7.1048+i/10000);
 const input={version:1,type:'chart',variant:'line',title:'美元兑人民币',note:meta.note,unit:'CNY per USD',
  labels,series:[{name:'usdcny',values}],detailColumns:['date','usdcny'],detailRows:labels.map((label,i)=>[label,values[i]])};
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
 const page=await browser.newPage({viewport:{width:566,height:330},colorScheme:'dark'});
 try{
  await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));
  const frame=page.frameLocator('iframe'),dataTab=frame.getByRole('tab',{name:'完整数据'});
  await dataTab.waitFor();
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  expect(await frame.locator('table').isVisible()).toBe(false);
  expect(await frame.locator('figcaption').isVisible()).toBe(false);
  const chart=await frame.locator('svg').boundingBox(),tab=await dataTab.boundingBox();
  expect(chart.height).toBeGreaterThanOrEqual(160);
  expect(chart.y+chart.height).toBeLessThan(tab.y);
  expect(tab.y+tab.height).toBeLessThanOrEqual(330);
  expect(await frame.locator('.chart-readout strong').allTextContents()).toContain(String(values.at(-1)));
  await frame.locator('svg').press('Home');
  expect(await frame.locator('.chart-readout strong').allTextContents()).toContain('7.1048');
  await frame.locator('svg').press('End');
  expect(await frame.locator('.chart-readout').textContent()).toContain(labels.at(-1));
  await dataTab.click();
  expect(await frame.locator('table').isVisible()).toBe(true);
  expect(await frame.locator('thead th:visible').allTextContents()).toEqual(['date','usdcny（CNY per USD）']);
  expect(await frame.locator('tbody tr').count()).toBe(labels.length);
 }finally{await page.close();}
},15000);
it('hides redundant cells in a saved chart without shifting surviving sort controls',async()=>{
 const input={version:1,type:'chart',variant:'line',title:'保存的螺纹钢走势',note:'收盘价口径',unit:'元/吨',
  labels:['2026-11-16','2026-11-17'],series:[{name:'收盘价（元/吨）',values:[3301,3289]}],
  detailColumns:['交易日','收盘价（元/吨）'],detailRows:[['2026-11-16',3301],['2026-11-17',3289]]};
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
 const legacy=spec.html
  .replace('<th>收盘价（元/吨）</th>','<th>收盘价（元/吨） (元/吨)</th><th>收盘价（元/吨）</th>')
  .replace(/(<td>(3301|3289)<\/td>)(?=<\/tr>)/g,'$1$1')
  .replace(/<script>\(function cartesianChart(?:Reading)?Runtime[^]*?<\/script>/,
   '<script>(function cartesianChartRuntime(spec, geometry){throw Error("Saved runtime must be upgraded")})({},()=>{});</script>')
  .replace(/,\[\]\);<\/script>/,',[1]);</script>');
 const page=await browser.newPage({viewport:{width:566,height:420}});
 try{
  await page.setContent(buildResearchHtmlPreview(legacy,spec.title,'light',{workbench:true,notoFont:'runtime'}));
  const frame=page.frameLocator('iframe'),tab=frame.getByRole('tab',{name:'完整数据'});
  await tab.waitFor();
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  await tab.click();
  expect(await frame.locator('thead th').count()).toBe(3);
  expect(await frame.locator('thead th:visible').allTextContents()).toEqual(['交易日','收盘价（元/吨）']);
  await frame.locator('thead th').nth(1).getByRole('button',{name:'按收盘价（元/吨）排序'}).click();
  expect(await frame.locator('tbody tr').first().locator('td:visible').allTextContents()).toEqual(['2026-11-17','3289']);
 }finally{await page.close();}
},15000);
it('replays explicit chart detail choices without opening the legacy relative close',async()=>{
 const input={version:1,type:'chart',variant:'line',title:'保存的明细状态',note:'收盘价口径',unit:'元/吨',
  labels:['2026-11-16','2026-11-17'],series:[{name:'收盘价',values:[3301,3289]}]};
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
 const preview=buildResearchHtmlPreview(spec.html,spec.title,'light',{workbench:true,notoFont:'runtime'});
 const openPreview=async page=>{
  await page.route('http://127.0.0.1/chart-details',route=>route.fulfill({contentType:'text/html',body:preview}));
  await page.goto('http://127.0.0.1/chart-details');
  await page.evaluate(()=>{
   window.chartDetailEvents=[];
   addEventListener('message',event=>{
    if(event.data?.type==='sherlock-interaction-event')window.chartDetailEvents.push(event.data.event);
   });
  });
  const frame=page.frameLocator('iframe');
  await frame.getByRole('tab',{name:'完整数据'}).waitFor();
  return frame;
 };
 const restore=(page,events)=>page.evaluate(events=>document.querySelector('iframe').contentWindow.postMessage(
  {type:'sherlock-interaction-state',state:{events:Object.fromEntries(events.map(event=>[event.id,event]))},readOnly:false},'*'),events);
 const page=await browser.newPage(),reopened=await browser.newPage();
 try{
  const frame=await openPreview(page);
  await restore(page,[]);
  await frame.getByRole('button',{name:'展开组件详情'}).click();
  await frame.getByRole('button',{name:'收起组件详情'}).click();
  await expect.poll(()=>page.evaluate(()=>window.chartDetailEvents.length)).toBe(2);
  const [open,close]=await page.evaluate(()=>window.chartDetailEvents);
  expect([open.checked,close.checked]).toEqual([true,false]);
  const legacyClose={...close,id:'legacy-close',clock:1};
  delete legacyClose.checked;
  const saved=await openPreview(reopened);
  await restore(reopened,[legacyClose]);
  await expect.poll(()=>saved.locator('table').isVisible()).toBe(false);
  await restore(reopened,[legacyClose,{...open,clock:2}]);
  await expect.poll(()=>saved.locator('table').isVisible()).toBe(true);
  await restore(reopened,[legacyClose,{...open,clock:2},{...close,clock:3}]);
  await expect.poll(()=>saved.locator('table').isVisible()).toBe(false);
 }finally{await page.close();await reopened.close();}
},15000);
it('keeps real date labels readable when resizing a chart with expanded details',async()=>{
 const labels=Array.from({length:60},(_,i)=>new Date(Date.UTC(2026,7,7+i)).toISOString().slice(0,10));
 for(const axisDecimals of [undefined,2]){
  const page=await browser.newPage({viewport:{width:566,height:650}});page.setDefaultTimeout(3000);
  try{
   const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'line',title:'三指数对比',unit:'基期=100',...(axisDecimals===undefined?{}:{axisDecimals}),labels,series:[{name:'指数甲',values:labels.map((_,i)=>100-i/3)},{name:'指数乙',values:labels.map((_,i)=>100+i/4)}],note:'各序列以首日为100。'})));
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');await frame.getByRole('tab',{name:'完整数据'}).waitFor();
   await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
   await frame.getByRole('tab',{name:'完整数据'}).click();
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
  expect(await frame.locator('table').isVisible()).toBe(false);
  expect(await frame.locator('.component-reading-footer dd').isVisible()).toBe(false);
  events.open={id:'open',clock:3,targetRoute:routes[0],tag:'SUMMARY',type:'click',checked:true};
  await page.evaluate(events=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events},readOnly:false},'*'),events);
  await expect.poll(()=>frame.locator('table').isVisible()).toBe(true);
  events.close={id:'close',clock:4,targetRoute:routes[0],tag:'SUMMARY',type:'click',checked:false};
  await page.evaluate(events=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events},readOnly:false},'*'),events);
  await expect.poll(()=>frame.locator('table').isVisible()).toBe(false);
  events.source={id:'source',clock:5,targetRoute:routes[1],tag:'SUMMARY',type:'click',checked:true};
  await page.evaluate(events=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events},readOnly:false},'*'),events);
  expect(await frame.getByRole('tab',{name:'口径与来源'}).count()).toBe(0);
  expect(await frame.locator('.component-reading-footer dd').isVisible()).toBe(false);
  expect(await frame.locator('.component-reading-toggle').evaluate(el=>getComputedStyle(el,'::before').content)).toBe('""');
  expect(await frame.locator('.component-reading-toggle').evaluate(el=>getComputedStyle(el,'::before').maskImage)).toContain('data:image/svg+xml');
 }finally{await page.close();}
},15000);
it('keeps chart detail entries visible together at the real compact card height',async()=>{
 const labels=['华泰柏瑞沪深300ETF','华夏上证科创板50成份ETF','南方中证1000ETF','南方中证500ETF','易方达创业板ETF'];
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'horizontal',title:'ETF流入前五',unit:'亿元',asOf:'2026-10-30 至 2026-11-06',note:'估算金额为份额变动乘以期末净值。',labels,series:[{name:'净流入估算',values:[321.13,234,216.07,199.55,182.89]}],detailColumns:['产品','代码'],detailRows:labels.map((label,i)=>[label,String(i)]),sources:[{label:'Tushare',url:'https://tushare.pro'}]})));
 const page=await browser.newPage({viewport:{width:566,height:303}});page.setDefaultTimeout(3000);
 try{
  await page.setContent('<script>window.detailSizes=[];addEventListener("message",event=>{if(event.data?.type==="sherlock-workbench-content-size")window.detailSizes.push(event.data)})</script>'+buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');
  await frame.locator('.component-reading-footer').waitFor({state:'attached'});
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  expect(await frame.locator('table').isVisible()).toBe(false);
  await frame.getByRole('tab',{name:'完整数据'}).click();
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
  expect(entries).toHaveLength(1);
  for(const entry of entries)expect(entry.bottom).toBeLessThanOrEqual(fittedHeight);
  expect((await frame.locator('svg').boundingBox()).height).toBeGreaterThanOrEqual(160);
  const dataTab=frame.getByRole('tab',{name:'完整数据'});
  expect(await frame.locator('tbody tr').count()).toBe(5);
  expect(await frame.locator('.data-scroll').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  expect(await frame.getByRole('tab',{name:'口径与来源'}).count()).toBe(0);
  expect(await frame.locator('.component-reading-footer dd').first().isVisible()).toBe(false);
  expect(await dataTab.getAttribute('aria-selected')).toBe('true');
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
   const frame=page.frameLocator('iframe'),footer=frame.locator('.component-reading-footer');await footer.waitFor({state:'attached'});
   expect(await footer.isVisible()).toBe(false);
   expect(await frame.locator('#indicator-refresh').isVisible()).toBe(false);expect(await frame.locator('.indicator-asof').isVisible()).toBe(false);
   expect(await footer.locator('dd').first().isVisible()).toBe(false);
   expect(await frame.locator('details.indicator-tile').evaluateAll(nodes=>nodes.every(el=>el.open))).toBe(true);
   expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
   const tiles=await frame.locator('.indicator-tile').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}));
   for(let i=1;i<tiles.length;i++)if(tiles[i].top===tiles[i-1].top)expect(tiles[i].left).toBeGreaterThanOrEqual(tiles[i-1].right);
   if(width===880&&theme==='dark'){mkdirSync('output/research-quality/footer',{recursive:true});await page.screenshot({path:'output/research-quality/footer/kpi-compact.png'});}
   expect(await footer.locator('dd').first().isVisible()).toBe(false);expect(await footer.textContent()).toContain(meta.note);
   expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
   expect(await footer.textContent()).toContain(meta.sources[0].url===undefined?'':meta.sources[0].name);
  }finally{await page.close();}
 }
},30000);
it('folds chart methodology while leaving legend filtering and full data usable',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'bar',title:'净流入前列',asOf:meta.asOf,note:meta.note,unit:'亿元',labels:['甲','乙'],series:[{name:'净流入估算',values:[20,10]},{name:'对比期',values:[15,8]}]})));
 const page=await browser.newPage({viewport:{width:620,height:580}});
 try{
  await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'dark',{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');await frame.locator('.component-reading-footer').waitFor({state:'attached'});
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
  expect(await frame.locator('figcaption').isVisible()).toBe(false);
  await frame.getByRole('tab',{name:'完整数据'}).click();await frame.locator('table').waitFor({state:'visible',timeout:2000});
  await frame.locator('[data-chart-series="0"]').click();expect(await frame.locator('[data-chart-series="0"]').getAttribute('aria-pressed')).toBe('false');
  expect(await frame.getByRole('tab',{name:'口径与来源'}).count()).toBe(0);expect(await frame.locator('.component-reading-footer').textContent()).toContain(meta.note);
  expect(await frame.locator('.component-reading-footer>details').isVisible()).toBe(false);
 }finally{await page.close();}
},20000);
it('keeps supplemental chart data collapsed until opened and supports sorting and resizing',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'horizontal',title:'净流入前列',asOf:meta.asOf,note:meta.note,unit:'亿元',labels:['甲','乙'],series:[{name:'净流入估算',values:[20,10]}],detailColumns:['产品','代码','规模（亿元）','管理人'],detailRows:[['甲','001',120,'甲基金'],['乙','002',null,'乙基金']],sources:[{label:'Tushare',url:'https://tushare.pro'}]})));
 for(const width of [360,880])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:680},colorScheme:theme});page.setDefaultTimeout(3000);
  try{
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,theme,{workbench:true,notoFont:'runtime'}));const frame=page.frameLocator('iframe');
   await frame.locator('.component-reading-footer').waitFor({state:'attached'});
   await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'));
   expect(await frame.locator('table').isVisible()).toBe(false);
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
   const group=await frame.getByRole('tablist').boundingBox(),toggle=await frame.getByRole('button',{name:'展开组件详情'}).boundingBox();
   expect(toggle.x).toBeGreaterThanOrEqual(group.x+group.width+12);expect(Math.abs(toggle.y+toggle.height/2-group.y-group.height/2)).toBeLessThan(1);
   for(const key of ['Home','End']){
    await frame.locator('svg').focus();await page.keyboard.press(key);
    const balance=await frame.locator('.chart-readout').evaluate(el=>{const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();return {above:t.top-r.top,below:r.bottom-t.bottom,height:r.height,scroll:el.scrollWidth,client:el.clientWidth};});
    expect(Math.abs(balance.above-balance.below)).toBeLessThanOrEqual(2);expect(balance.height).toBeGreaterThanOrEqual(32);expect(balance.scroll).toBeLessThanOrEqual(balance.client+1);
   }
   const beforeSwitch=await frame.getByRole('tablist').boundingBox();
   expect(await frame.getByRole('tab',{name:'口径与来源'}).count()).toBe(0);expect(await frame.locator('table').isVisible()).toBe(false);
   await frame.getByRole('tab',{name:'完整数据'}).click();
   expect(await frame.locator('table').isVisible()).toBe(true);
   await frame.getByRole('button',{name:'收起组件详情'}).click();
   const after=await frame.getByRole('tablist').boundingBox();expect(Math.abs(after.y-beforeSwitch.y)).toBeLessThan(1);
   expect(await frame.locator('table').isVisible()).toBe(false);
   await frame.getByRole('button',{name:'展开组件详情'}).focus();await page.keyboard.press('Enter');expect(await frame.locator('table').isVisible()).toBe(true);
  }finally{await page.close();}
 }
},20000);

it('packs twelve financial metrics without oversized gaps, clipped dates or detached units',async()=>{
 const items=[
  {label:'报告期',value:'20260630',detail:'财务报表实际报告期'},
  {label:'销售毛利率',value:23.16,unit:'%'},{label:'净资产收益率(ROE)',value:2.77,unit:'%'},{label:'扣非ROE',value:1.86,unit:'%'},
  {label:'基本每股收益(EPS)',value:.56,unit:'元'},{label:'市盈率(静态PE)',value:188.38,unit:'倍'},{label:'市盈率(TTM)',value:131.75,unit:'倍'},{label:'市净率(PB)',value:5.54,unit:'倍'},
  {label:'总市值',value:9495.71,unit:'亿元'},...['营业收入','归母净利润','研发费用'].map(label=>({label,value:null,missing:'当前财务报告未提供该项数据'}))
 ];
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'kpi',title:'合成财务布局检查',items,asOf:'2026-06-30',note:'合成数据，仅验证布局。'})));
 for(const mode of ['enterprise','dark'])for(const width of [320,480,960]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   await page.route('**/*',r=>r.abort());
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'light',{workbench:true}));
   const frame=page.frames()[1];await frame.waitForSelector('.indicator-tile');
   await page.evaluate(mode=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-workbench-style',mode,controlTheme:mode==='dark'?'dark':'light'},'*'),mode);
   await frame.waitForFunction(mode=>document.documentElement.dataset.workbenchStyle===mode,mode);
   const metrics=await frame.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};
    return {grid:box(document.querySelector('.indicator-grid')),tiles:[...document.querySelectorAll('.indicator-tile')].map(e=>({box:box(e),font:parseFloat(getComputedStyle(e.querySelector('.indicator-value')).fontSize),overflow:e.scrollWidth>e.clientWidth+1})),text:document.body.innerText,date:document.querySelector('.indicator-value').textContent,unit:getComputedStyle(document.querySelector('.indicator-unit')).display};
   });
   expect(metrics.tiles).toHaveLength(12);expect(metrics.date).toBe('2026-06-30');expect(metrics.unit).toBe('inline-block');
   expect(metrics.grid.height).toBeLessThan(width===960?340:640);
   for(const tile of metrics.tiles){expect(tile.font).toBeLessThanOrEqual(22);expect(tile.overflow).toBe(false);}
   expect(metrics.text).toContain('当前财务报告未提供该项数据');expect(metrics.text).toContain('财务报表实际报告期');
   for(let i=1;i<metrics.tiles.length;i++){const a=metrics.tiles[i-1].box,b=metrics.tiles[i].box;if(a.top===b.top)expect(a.bottom).toBe(b.bottom);}
   if(mode==='enterprise'&&width!==320){mkdirSync('output/research-quality/kpi-density',{recursive:true});await page.screenshot({path:`output/research-quality/kpi-density/${width}.png`});}
  }finally{await page.close();}
 }
},20000);
