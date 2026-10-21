import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {refineStoredTemplateHtml} from '../packages/dsh-research-task-runtime/stored-template-refinements.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})
const rendered=data=>JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
const strip=html=>html.replace(/\/\* reading-layout-v1 \*\/[^]*?\/\* reading-layout-end \*\//u,'')
it('keeps the entire schedule label and owner visible inside the real themed host preview',async()=>{
 const data={version:1,type:'gantt',title:'海上作业排程',asOf:'演练记录',items:[{label:'【绞车泳道】S2 绞车占用·沉积物柱状取样与采水交接',owner:'B 大副/绞车操作员',start:'2026-10-22',end:'2026-10-23',detail:'完整说明',progress:0}]},spec=rendered(data);
 for(const mode of ['light','dark','openterminal','enterprise']){
  const page=await browser.newPage({viewport:{width:656,height:480}});
  try{
   await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,mode==='light'?'light':'dark',{workbench:true,notoFont:'runtime'}));
   const frame=page.frameLocator('iframe');await frame.locator('.gantt-task').waitFor();
   await frame.locator('html').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode);
   const box=await frame.locator('.gantt-task').boundingBox(),owner=await frame.locator('.gantt-task small').boundingBox();
   expect(owner.y+owner.height).toBeLessThanOrEqual(box.y+box.height+.5);
   expect(await frame.locator('.gantt-task').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
   await frame.locator('.gantt-task').click();expect(await frame.locator('.gantt-readout').textContent()).toContain('完整说明');
  }finally{await page.close()}
 }
},20000)
it('keeps a long checklist subject above the filters in current and saved narrow components',async()=>{
 const data={version:1,type:'tasks',title:'出航准备',subject:'极夜科考·出航演练｜离港倒计时18小时（锚点2026-10-22 12:00 Asia/Shanghai）',asOf:'演练记录',mode:'local',items:[{id:'a',title:'检查设备',owner:'采样与实验室负责人',status:'进行中',completed:false}]},spec=rendered(data)
 for(const html of [spec.html,refineStoredTemplateHtml(strip(spec.html))]){
  const page=await browser.newPage({viewport:{width:400,height:480}})
  try{await page.setContent(html);const h=await page.locator('.operation-head h2').boundingBox(),head=await page.locator('.operation-head').boundingBox(),filter=await page.locator('#task-filter').boundingBox()
   expect(h.width).toBeGreaterThan(head.width-2);expect(h.height).toBeLessThan(160);expect(filter.y).toBeGreaterThanOrEqual(h.y+h.height)
   await page.locator('input[type=checkbox]').check();expect(await page.locator('#operation-count').textContent()).toBe('1 / 1 已完成')
  }finally{await page.close()}
 }
})
it('gives dense timed Gantt rows natural height and puts full details after the schedule without crowding the axis',async()=>{
 const data={version:1,type:'gantt',title:'资源排程',asOf:'演练记录 · UTC+08:00',items:Array.from({length:13},(_,i)=>({label:`站位${i+1}｜绞车占用与样本处理交接`,owner:'采样与湿实验室负责人',start:`2026-10-22T${String(10+Math.floor(i/2)).padStart(2,'0')}:00:00+08:00`,end:`2026-10-22T${String(11+Math.floor(i/2)).padStart(2,'0')}:00:00+08:00`,detail:'完整排期条件和交接说明。'.repeat(25),progress:0}))},spec=rendered(data),saved=refineStoredTemplateHtml(strip(spec.html))
 expect(readTemplateModel({type:'html',html:saved})).toEqual(readTemplateModel(spec));expect(refineStoredTemplateHtml(saved)).toBe(saved)
 for(const html of [spec.html,saved])for(const width of [900,1280]){
  const page=await browser.newPage({viewport:{width,height:400}})
  try{await page.setContent(html);const rows=await page.locator('.gantt-rows').boundingBox(),first=await page.locator('.gantt-row').first().boundingBox(),detail=await page.locator('.gantt-readout').boundingBox()
   expect(first.height).toBeGreaterThanOrEqual(44);expect(rows.height).toBeGreaterThan(13*44-2);
   if(width<1120)expect(detail.y).toBeGreaterThanOrEqual(rows.y+rows.height);else expect(detail.x).toBeGreaterThanOrEqual(rows.x+rows.width);
   await page.locator('.gantt-task').nth(1).click();expect(await page.locator('.gantt-readout').textContent()).toContain('站位2｜绞车占用与样本处理交接');
   const ticks=await page.locator('.gantt-axis time').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right}}))
   for(let i=1;i<ticks.length;i++)expect(ticks[i].left).toBeGreaterThanOrEqual(ticks[i-1].right)
  }finally{await page.close()}
 }
},20000)
