import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {refineStoredTemplateHtml} from '../packages/dsh-research-task-runtime/stored-template-refinements.js'
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})
const data={version:1,type:'alerts',title:'演练预案',subject:'单绞车故障应急替代安排与恢复检查',asOf:'演练记录',mode:'local',items:[{id:'a',title:'绞车异常',summary:'暂停采样并检查，不删除业务内容。',category:'设备异常与资源替代',date:'演练时点',read:false}]}
it('keeps current and saved alert headings readable beside filters at component widths',async()=>{
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),legacy=spec.html.replace('.workflow-tools h2{flex:1 0 100%}', '.workflow-tools h2{flex:1}')
 const refined=refineStoredTemplateHtml(legacy)
 expect(readTemplateModel({type:'html',html:refined})).toEqual(readTemplateModel(spec));expect(refineStoredTemplateHtml(refined)).toBe(refined)
 for(const html of [spec.html,refined])for(const width of [400,656]){
  const page=await browser.newPage({viewport:{width,height:600}})
  try{
   await page.setContent(html)
   const heading=await page.locator('.workflow-tools h2').boundingBox(),tools=await page.locator('.workflow-tools').boundingBox(),category=await page.locator('#alert-category').boundingBox()
   expect(heading.width).toBeGreaterThan(tools.width-2);expect(category.y).toBeGreaterThanOrEqual(heading.y+heading.height)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
   await page.locator('details summary').click();expect(await page.locator('details').getAttribute('open')).not.toBeNull()
  }finally{await page.close()}
 }
},20000)
