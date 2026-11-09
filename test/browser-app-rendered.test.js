import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
let browser,code
const evidence=process.env.BROWSER_APP_EVIDENCE||'/tmp/browser-app-figma-20261109'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`import {BrowserAppView} from './src/preload/browser/view';
let listener;let n=0;const data={tabs:[{id:'tab0',url:'',title:'新标签页',private:false,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}],activeId:'tab0',history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}};
window.browserCalls=[];window.snapshot=()=>structuredClone(data);window.update=()=>listener(structuredClone(data));
const bridge={subscribe:f=>{listener=f;return()=>{}},source:async(...args)=>window.browserCalls.push(['source',...args]),request:async(method,input={})=>{window.browserCalls.push([method,input]);const t=data.tabs.find(t=>t.id===data.activeId);if(method==='capture')return '';if(method==='new'){const tab={...t,id:'tab'+(++n),title:'新标签页',url:'',private:!!input.private};data.tabs.push(tab);data.activeId=tab.id}if(method==='select')data.activeId=input.id;if(method==='navigate'){t.url=input.url;t.title='Example Domain';data.history.unshift({id:'h'+n,url:input.url,title:t.title,at:Date.now()})}if(method==='bookmark'){data.bookmarks.push({id:'b'+n,url:input.url,title:input.title,folder:input.folder,at:Date.now()})}if(method==='folder')data.folders.push(input.name);if(method==='settings')Object.assign(data.settings,input);if(method==='clear'&&input.history)data.history=[];if(method==='find')t.find={matches:6,activeMatchOrdinal:1};return structuredClone(data)}};
const host={register:(_name,el)=>document.body.append(el),open:()=>{},close:()=>{},current:()=>({surface:'browser'})};window.browserView=new BrowserAppView(document,bridge,host);window.browserView.open('session-A');`},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'inline',setup(b){b.onResolve({filter:/\?inline$/},args=>({path:resolve(dirname(args.importer),args.path.replace('?inline','')),namespace:'inline'}));b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml;base64,'+Buffer.from(await readFile(args.path)).toString('base64'):await readFile(args.path,'utf8')),loader:'json'}))}}]});code=result.outputFiles[0].text
 const pw=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):await import('playwright');browser=await pw.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});await mkdir(evidence,{recursive:true})
},20000)
afterAll(async()=>browser?.close())
async function fixture(width=1920,height=1080,dark=true){const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setContent(`<html><head><style>body{margin:0;background:#151515}.pI_x6G_centerCol{position:fixed;left:${width===1920?306:64}px;top:10px;right:${width===1920?420:10}px;bottom:10px}</style></head><body ${dark?'data-ds-dark-theme':''}><main class="pI_x6G_centerCol"></main></body></html>`);await page.addScriptTag({content:code});await page.getByRole('heading',{name:'从这里，打开一个新视野。'}).waitFor();return {page,errors}}
it('matches the Figma chrome dimensions and handles actual URL, multi-tab, collection and settings controls',async()=>{
 const {page,errors}=await fixture();try{
  await expect.poll(()=>page.locator('.eb-root').evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(1194)
  for(const [cls,height]of [['eb-tabs',44],['eb-toolbar',48],['eb-bookmarks-bar',32],['eb-status',24]])expect(await page.locator('.'+cls).evaluate(el=>el.getBoundingClientRect().height)).toBe(height)
  await page.screenshot({path:evidence+'/start-dark.png'})
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.fill('https://example.com/');await address.press('Enter');await expect.poll(()=>address.inputValue()).toBe('https://example.com/')
  await page.getByRole('button',{name:'添加收藏',exact:true}).click();await page.getByRole('textbox',{name:'名称',exact:true}).fill('自己的研究收藏');await page.getByRole('button',{name:'完成',exact:true}).click();expect(await page.evaluate(()=>window.snapshot().bookmarks[0].title)).toBe('自己的研究收藏')
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();expect(await page.getByRole('dialog',{name:'收藏夹'}).innerText()).toContain('自己的研究收藏');await page.screenshot({path:evidence+'/bookmarks-dark.png'});await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'新标签页',exact:true}).click();expect(await page.getByRole('tab').count()).toBe(2);expect(await page.getByRole('tab',{selected:true}).innerText()).toContain('新标签页')
  await page.getByRole('button',{name:'更多浏览器操作',exact:true}).click();await page.screenshot({path:evidence+'/menu-dark.png'});await page.getByRole('menuitem',{name:/浏览器设置/}).click();await page.getByRole('combobox',{name:'默认搜索引擎'}).selectOption('Bing');expect(await page.evaluate(()=>window.snapshot().settings.engine)).toBe('Bing')
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
it('keeps the narrow/light layout usable without clipped tools and exercises keyboard find and source handoff',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.fill('https://example.com/');await address.press('Enter');await page.keyboard.press('Control+f');const find=page.getByRole('textbox',{name:'查找内容'});await find.fill('Example');await expect.poll(()=>page.getByRole('search',{name:'页内查找'}).innerText()).toContain('1 / 6');await page.screenshot({path:evidence+'/find-light.png'});await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'更多浏览器操作',exact:true}).click();await page.getByRole('menuitem',{name:'发送到对话'}).click();expect(await page.evaluate(()=>window.browserCalls.some(c=>c[0]==='source'&&c[1]==='session-A'&&c[2].url==='https://example.com/'))).toBe(true)
  await page.getByRole('button',{name:'更多浏览器操作',exact:true}).click();await page.getByRole('menuitem',{name:'新建隐私标签页'}).click();await page.getByRole('heading',{name:'隐私浏览',exact:true}).waitFor();await page.screenshot({path:evidence+'/private-light.png'})
  const over=await page.locator('.eb-root').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(over.scroll).toBe(over.width);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
