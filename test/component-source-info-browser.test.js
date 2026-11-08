import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {deliveryCardsRuntime} from '../scripts/lib/deliverable-cards.mjs'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {componentSourceDefinitions,componentSourceCss,getComponentSourceInfo,componentSourceReferencedFiles} from '../scripts/lib/component-source-info.mjs'
import {componentDataStatusDefinitions,componentDataStatusCss} from '../scripts/lib/component-data-status.mjs'
import {componentDataSettingsCss} from '../scripts/lib/component-data-settings-panel.mjs'
let browser,script
beforeAll(async()=>{
 const definitions=deliveryCardsRuntime()+componentDataStatusDefinitions()
 const entry=`import * as react from 'react';import * as react_dom from 'react-dom';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 const require=()=>({IconChevronDownOutline14:()=>null,writeClipboard:async()=>true}),sherlockShared=()=>false,openComponentData=()=>{};
 window.dshDesktop={researchFilesAvailable:async paths=>paths.map(()=>true),showItemInFolder:async path=>{window.revealed=path},conversationBrowser:{openSource:async value=>{window.networkOpened=value}}};window.calls=[];
 ${definitions}
 const right=createRoot(document.getElementById('right')),main=createRoot(document.getElementById('main'));
 const coordinator={sessions:{list:{getSnapshot:()=>({current:'sources',byId:{sources:{cwd:'/workspace'}}})}},sourceWorkspaces:{openPath:async path=>window.systemOpened=path},service:{openTab:tab=>{window.lastTab=tab;right.render(react_jsx_runtime.jsx(ComponentSourceDetailsTab,{tab,scope:{sessionId:'sources'},coordinator}))},setPanelState:()=>{},openFile:(scope,path)=>window.previewOpened={scope,path}}};
 window.show=(node)=>main.render(react_jsx_runtime.jsxs(react.Fragment,{children:[react_jsx_runtime.jsx(ComponentSourceHost,{coordinator}),react_jsx_runtime.jsx('div',{'data-research-node-id':node.id,children:react_jsx_runtime.jsx(ComponentDataStatusBar,{node,sessionId:'sources'})})]}));`
 script=(await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(){
 const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)})
 await page.route('http://127.0.0.1/sources',route=>route.fulfill({contentType:'text/html',body:`<style>${componentSourceCss+componentDataStatusCss+componentDataSettingsCss}#main{width:680px}#right{position:absolute;left:720px;top:0;width:360px;height:800px}</style><div id="main"></div><div id="right"></div>`}))
 await page.goto('http://127.0.0.1/sources');await page.addScriptTag({content:script});return {page,errors}
}
it('opens the actual chat file card, all ambiguous file matches, preview and system open choices without guessing paths',async()=>{
 const {page,errors}=await fixture()
 try{
  await page.route('**/sidebar/api/fs.search',route=>{const body=route.request().postDataJSON();expect(body).toEqual({sessionId:'sources',cwd:'/workspace',query:'组织资料.docx'});return route.fulfill({json:{ok:true,value:{matches:['/workspace/one/组织资料.docx','/workspace/two/组织资料.docx'],truncated:false}}})})
  await page.evaluate(()=>show({id:'org',title:'完整架构',containerSpec:{version:1,type:'mind-map',source:{title:'组织资料.docx',text:'逐条部门与人员完整原文'},note:'核查说明及页码[P4]',asOf:'2026-11-05'}}))
  await page.getByRole('button',{name:'查看来源文件：组织资料.docx'}).click()
  const dialog=page.getByRole('dialog',{name:'来源文件'});await expect.poll(()=>dialog.locator('.ew-delivery-card').count(),{timeout:5000}).toBe(2)
  const card=dialog.locator('.ew-delivery-card').first(),open=card.locator('.ew-delivery-open'),options=card.locator('.ew-delivery-options')
  const background=()=>card.evaluate(el=>getComputedStyle(el).backgroundColor),idle=await background()
  await open.hover();expect(await background()).not.toBe(idle)
  expect(await open.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await options.hover();expect(await background()).not.toBe(idle)
  await page.screenshot({path:'/tmp/ework-live-rail/source-files-popup.png'})
  await dialog.getByRole('button',{name:'打开方式：组织资料.docx'}).first().click()
  await dialog.getByRole('menuitem',{name:'用默认应用打开'}).click();await expect.poll(()=>page.evaluate(()=>window.systemOpened)).toBe('/workspace/one/组织资料.docx')
  await dialog.getByRole('button',{name:'打开方式：组织资料.docx'}).last().click();await dialog.getByRole('menuitem',{name:'在客户端中预览'}).click()
  await expect.poll(()=>page.evaluate(()=>window.previewOpened)).toEqual({scope:{sessionId:'sources',cwd:'/workspace'},path:'/workspace/two/组织资料.docx'})
  await expect.poll(()=>dialog.count()).toBe(0)
  await page.getByRole('button',{name:'查看来源信息',exact:true}).click()
  await expect.poll(()=>page.locator('#right').textContent()).toContain('逐条部门与人员完整原文')
  expect(await page.locator('#right').textContent()).toContain('核查说明及页码[P4]');expect(await page.locator('#right').textContent()).toContain('2026-11-05');expect(errors).toEqual([])
 }catch(e){console.error(await page.locator('body').innerText());throw e}finally{await page.close()}
})
it('retains every web citation and long source body in the right panel and opens the original URL',async()=>{
 const {page,errors}=await fixture()
 try{
  const sources=Array.from({length:35},(_,i)=>({label:'原始来源'+i,url:'https://source.example.org/reports/'+i+'?page=2'})),note='完整来源口径。'.repeat(2000)
  await page.evaluate(({sources,note})=>show({id:'web',title:'跨来源研究',containerSpec:{type:'table',sources,asOf:'2026-11-08',note}}),{sources,note})
  await page.getByRole('button',{name:'查看来源信息',exact:true}).click()
  await expect.poll(()=>page.locator('#right a').count()).toBe(35)
  expect(await page.locator('#right pre').textContent()).toBe(note);await page.screenshot({path:'/tmp/ework-live-rail/source-web-details.png'})
  await page.locator('#right a').first().click();await expect.poll(()=>page.evaluate(()=>window.networkOpened)).toEqual({sessionId:'sources',url:sources[0].url})
  expect(errors).toEqual([])
 }catch(e){console.error(await page.locator('body').innerText());throw e}finally{await page.close()}
})
it('does not turn unsafe URLs or an unresolved file name into fabricated provenance',()=>{
 const info=getComponentSourceInfo({containerSpec:{source:{title:'unknown.docx',url:'javascript:alert(1)',text:'真实原文'},sources:[{name:'登录源',url:'https://user:secret@example.com'}]}})
 expect(info.records.map(row=>row.url)).toEqual(['','']);expect(info.records[1]).toMatchObject({filename:'unknown.docx',path:'',text:'真实原文'})
})

it('resolves real user-attached files outside the workspace and rejects assistant-invented paths or other file names',()=>{
 const node=(kind,path,source='user')=>({kind,data:{source:{kind:source},content:[{type:'text',text:'📎 文件：`'+path+'`'}]}})
 const snapshot={chat:{nodes:new Map([['one',node('user','/Downloads/组织资料.docx')],['two',node('assistant','/fake/组织资料.docx')],['three',node('user','/Downloads/other.docx')],['four',node('user','/tool/组织资料.docx','tool')]])}}
 expect(componentSourceReferencedFiles(snapshot,'组织资料.docx')).toEqual(['/Downloads/组织资料.docx'])
 expect(componentSourceReferencedFiles({chat:{nodes:new Map([['one',{kind:'user',data:{source:{kind:'user'},content:[{type:'text',text:'encoded'}]}}]])}},'组织资料.docx',()=>({files:[{path:'/Original/组织资料.docx'}]}))).toEqual(['/Original/组织资料.docx'])
})


it('moves a saved table complete methodology, date and file locators into the right source pane without changing rows',async()=>{
 const {page,errors}=await fixture()
 try{
  const note='部门总数16个，原文见[T7]；†表示现职需复核，—不代表岗位空缺。'.repeat(20)
  const data={version:1,type:'market',variant:'table',title:'部门负责人明细',asOf:'2026-11-05',note,sources:[{label:'组织资料.docx（T8、P24、P30、P36-P38）'}],columns:['部门','负责人'],rows:Array.from({length:20},(_,i)=>['部门'+i,'文档未确认'])}
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
  await page.evaluate(spec=>show({id:'saved',title:spec.title,containerSpec:spec}),spec)
  await page.getByRole('button',{name:'查看来源信息',exact:true}).click()
  await expect.poll(()=>page.locator('#right pre').first().textContent()).toContain(note)
  expect(await page.locator('#right pre').count()).toBe(1)
  expect(await page.locator('#right').textContent()).toContain('T8、P24、P30、P36-P38')
  expect(await page.locator('#right').textContent()).toContain('2026-11-05')
  expect(getComponentSourceInfo({containerSpec:spec}).notes).toContain(note)
  expect(errors).toEqual([])
 }finally{await page.close()}
})

it('collects explicitly labeled legacy HTML source footers without treating unrelated footer content as provenance',async()=>{
 const {page,errors}=await fixture()
 try{
  const html='<main>真实图形内容</main><div class="src">来源：npm registry；获取时间不等于发布日期。<a href="https://registry.npmjs.org/vue/latest">原始元数据</a></div><footer>业务合计99条</footer>'
  await page.evaluate(html=>show({id:'legacy',title:'网络关系图',containerSpec:{type:'html',html}}),html)
  await page.getByRole('button',{name:'查看来源信息',exact:true}).click()
  await expect.poll(()=>page.locator('#right').textContent()).toContain('获取时间不等于发布日期')
  expect(await page.locator('#right').textContent()).not.toContain('业务合计99条')
  expect(await page.locator('#right a').getAttribute('href')).toBe('https://registry.npmjs.org/vue/latest')
  expect(errors).toEqual([])
 }finally{await page.close()}
})

it('recognizes labeled real attachment names while retaining source labels and exact filename matching',()=>{
 for(const prefix of ['整理文档：','来源文件：','来源文件：来源文件：','附件: ']){
  const label=prefix+'组织资料.docx（T8、P24）',info=getComponentSourceInfo({containerSpec:{source:{title:label,text:'真实原文'}}})
  expect(info.records[0]).toMatchObject({label,filename:'组织资料.docx',path:''})
 }
})
