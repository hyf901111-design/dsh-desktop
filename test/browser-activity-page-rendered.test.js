import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

let browser,code
const evidence=process.env.BROWSER_APP_EVIDENCE||'/tmp/browser-app-activity-pages-20261110'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`import {BrowserActivityPage} from './src/preload/browser/activity-page';
const at=Date.now();const data={tabs:[],activeId:'',closed:[{id:'closed',title:'最近关闭的文章',url:'https://closed.example/',at},{id:'internal',title:'新标签页',url:'',at},{id:'script',title:'危险网址',url:'javascript:alert(1)',at}],history:Array.from({length:225},(_,i)=>({id:'h'+i,title:i===224?'远处的完整搜索结果':'研究记录 '+i,url:'https://research.example/'+i,at:at-i*3600000})),bookmarks:[],folders:[],downloads:[{id:'progress',tabId:'t',private:false,name:'进行中的报告.pdf',url:'https://files.example/progress',path:'/tmp/progress',received:512,total:1024,state:'progressing'},{id:'unknown',tabId:'t',private:false,name:'未知大小.zip',url:'https://files.example/unknown',path:'/tmp/unknown',received:1024,total:0,state:'progressing'},{id:'done',tabId:'t',private:false,name:'已下载报告.pdf',url:'https://files.example/report',path:'/tmp/done',received:2048,total:2048,state:'completed'},{id:'interrupted',tabId:'t',private:false,name:'失败记录.zip',url:'https://files.example/fail',path:'/tmp/fail',received:128,total:1024,state:'interrupted'},{id:'cancelled',tabId:'t',private:false,name:'已取消.zip',url:'https://files.example/cancel',path:'/tmp/cancel',received:0,total:100,state:'cancelled'}],settings:{engine:'Google',startup:'new',bookmarksBar:true,askDownload:false,downloadPath:''}};
window.activityCalls=[];window.activityNotices=[];window.activityState=()=>structuredClone(data);window.setActivityState=changes=>{Object.assign(data,changes);activity.update(structuredClone(data))};
const activity=new BrowserActivityPage(document,window.activityKind,{openUrl:url=>window.openedUrl=url,clearHistory:()=>window.clearRequested=true,notify:(...args)=>window.activityNotices.push(args),request:async(method,input={})=>{window.activityCalls.push([method,input]);if(window.failNext){window.failNext=false;throw Error('模拟操作失败')}if(method==='history-remove')data.history=data.history.filter(h=>h.id!==input.id);if(method==='download'){const row=data.downloads.find(d=>d.id===input.id);if(row){if(input.action==='pause')row.state='paused';if(input.action==='resume'||input.action==='retry')row.state='progressing';if(input.action==='cancel')row.state='cancelled';if(input.action==='remove')data.downloads=data.downloads.filter(d=>d!==row)}}activity.update(structuredClone(data));return structuredClone(data)}});
activity.update(structuredClone(data));activity.mount(document.querySelector('.eb-content'));window.activity=activity;window.remountActivity=()=>{activity.preserve();activity.update(structuredClone(data));document.querySelector('.eb-root').innerHTML='<div class="eb-content"></div>';activity.mount(document.querySelector('.eb-content'))};`},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'inline',setup(b){b.onResolve({filter:/\?inline$/},args=>({path:new URL(args.path.replace('?inline',''),pathToFileURL(args.resolveDir+'/')).pathname,namespace:'inline'}));b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent(await readFile(args.path,'utf8')):await readFile(args.path,'utf8')),loader:'json'}))}}]});code=result.outputFiles[0].text
 const pw=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):await import('playwright');browser=await pw.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});await mkdir(evidence,{recursive:true})
},20000)
afterAll(async()=>browser?.close())
async function fixture(kind='history',width=1040,dark=false){
 const page=await browser.newPage({viewport:{width,height:760}}),errors=[];page.on('pageerror',error=>errors.push(error.message));const css=await readFile('src/preload/browser/style.css','utf8');await page.setContent(`<html><head><title>Browser activity fixture</title><style>${css}.eb-root{inset:8px}.eb-content{position:relative;flex:1;min-height:0;container-type:inline-size}</style></head><body><section class="eb-root" data-dark="${dark}"><div class="eb-content"></div></section></body></html>`);await page.evaluate(value=>window.activityKind=value,kind);await page.addScriptTag({content:code});return{page,errors}
}
it('groups history by day, paginates 200 records and searches the complete history',async()=>{
 const {page,errors}=await fixture();try{
  expect(await page.getByRole('heading',{name:'历史记录',exact:true}).count()).toBe(1);expect(await page.locator('[data-activity-row]').count()).toBe(200);expect(await page.locator('.eb-activity-date').count()).toBeGreaterThan(1)
  await page.getByRole('button',{name:'显示更多',exact:true}).click();expect(await page.locator('[data-activity-row]').count()).toBe(225)
  await page.getByRole('searchbox',{name:'搜索历史记录',exact:true}).fill('完整搜索');expect(await page.locator('[data-activity-row]').count()).toBe(1);await page.getByRole('button',{name:'打开 远处的完整搜索结果',exact:true}).click();expect(await page.evaluate(()=>window.openedUrl)).toBe('https://research.example/224')
  await page.getByRole('button',{name:'删除 远处的完整搜索结果',exact:true}).click();await expect.poll(()=>page.locator('[data-activity-row]').count()).toBe(0);expect(await page.getByText('没有找到匹配的历史记录',{exact:true}).count()).toBe(1)
  await page.getByRole('button',{name:'清除浏览数据',exact:true}).click();expect(await page.evaluate(()=>window.clearRequested)).toBe(true);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('shows only usable recently closed pages and escapes supplied history content',async()=>{
 const {page}=await fixture();try{
  await page.getByRole('tab',{name:'最近关闭',exact:true}).click();expect(await page.locator('[data-activity-row]').count()).toBe(1);await page.getByRole('button',{name:'打开 最近关闭的文章',exact:true}).click();expect(await page.evaluate(()=>window.openedUrl)).toBe('https://closed.example/');expect(await page.getByRole('button',{name:/删除/}).count()).toBe(0)
  await page.getByRole('tab',{name:'全部记录',exact:true}).click();await page.evaluate(()=>window.setActivityState({history:[{id:'\"<unsafe>',title:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)',at:Date.now()}]}));expect(await page.locator('.eb-activity-page img').count()).toBe(0);expect(await page.getByRole('button',{name:'打开 <img src=x onerror=alert(1)>',exact:true}).isDisabled()).toBe(true)
 }finally{await page.close()}
})
it('retains search text, caret, focus, IME node and scroll when its host is rebuilt',async()=>{
 const {page}=await fixture();try{
  const search=page.getByRole('searchbox',{name:'搜索历史记录',exact:true});await search.fill('研究');await search.evaluate(el=>{el.setSelectionRange(1,2);window.originalSearch=el;el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))});await page.locator('.eb-activity-scroll').evaluate(el=>el.scrollTop=350);await page.evaluate(()=>window.remountActivity())
  expect(await search.inputValue()).toBe('研究');expect(await search.evaluate(el=>el===window.originalSearch&&el===document.activeElement)).toBe(true);expect(await search.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([1,2]);expect(await page.locator('.eb-activity-scroll').evaluate(el=>el.scrollTop)).toBe(350)
  await search.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.evaluate(()=>{const menu=document.createElement('button');menu.textContent='全局菜单';document.body.append(menu);menu.focus();window.globalMenu=menu;window.remountActivity()});expect(await page.evaluate(()=>document.activeElement===window.globalMenu)).toBe(true)
 }finally{await page.close()}
})
it('renders real download progress and supports state-specific actions without file deletion',async()=>{
 const {page,errors}=await fixture('downloads');try{
  const progress=page.locator('[data-activity-row="progress"]');expect(await progress.getByRole('progressbar').getAttribute('value')).toBe('512');expect(await progress.getByRole('progressbar').getAttribute('max')).toBe('1024');expect(await page.locator('[data-activity-row="unknown"] progress').getAttribute('value')).toBeNull()
  await progress.getByRole('button',{name:'暂停',exact:true}).click();expect(await progress.getByText('已暂停',{exact:false}).count()).toBe(1);await progress.getByRole('button',{name:'继续下载',exact:true}).click();await progress.getByRole('button',{name:'取消',exact:true}).click();await progress.getByRole('button',{name:'重试',exact:true}).click()
  const done=page.locator('[data-activity-row="done"]');for(const name of ['打开','在文件夹中显示','加入工作材料'])await done.getByRole('button',{name,exact:true}).click();await done.getByRole('button',{name:'移除记录',exact:true}).click();expect(await done.count()).toBe(0)
  await page.getByRole('button',{name:'打开下载文件夹',exact:true}).click();expect(await page.evaluate(()=>window.activityCalls.map(c=>c[1].action))).toEqual(['pause','resume','cancel','retry','open','reveal','material','remove','directory']);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('searches download filenames and URLs and reports request errors without losing search',async()=>{
 const {page}=await fixture('downloads');try{
  const search=page.getByRole('searchbox',{name:'搜索下载内容',exact:true});await search.fill('files.example/fail');expect(await page.locator('[data-activity-row]').count()).toBe(1);await page.evaluate(()=>window.failNext=true);await page.getByRole('button',{name:'重试',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.activityNotices)).toEqual([['模拟操作失败',true]]);expect(await search.inputValue()).toBe('files.example/fail')
  await search.fill('不存在');expect(await page.getByText('没有找到匹配的下载内容',{exact:true}).count()).toBe(1);await page.getByRole('button',{name:'清空搜索',exact:true}).click();expect(await search.inputValue()).toBe('');await page.evaluate(()=>window.setActivityState({downloads:[]}));expect(await page.getByText('还没有下载内容',{exact:true}).count()).toBe(1)
 }finally{await page.close()}
})
it('keeps light/dark pages and narrow download actions readable without horizontal overflow',async()=>{
 for(const [kind,width,dark]of [['history',1040,false],['downloads',1040,true],['history',360,true],['downloads',360,false]]){
  const {page,errors}=await fixture(kind,width,dark);try{
   expect(await page.title()).toBe('Browser activity fixture');expect(await page.locator('.eb-activity-page').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}))).toEqual({scroll:width-16,client:width-16});expect(await page.locator('.eb-activity-page').evaluate(el=>getComputedStyle(el).fontSize)).toBe('14px');expect(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontSize)).toBe('24px');expect(await page.locator('.eb-activity-icon').evaluateAll(els=>els.every(el=>getComputedStyle(el).maskImage!=='none'))).toBe(true)
   expect(await page.locator('.eb-activity-header button').evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(12);await page.screenshot({path:evidence+'/'+kind+'-'+(dark?'dark':'light')+'-'+width+'.png'});expect(errors).toEqual([])
  }finally{await page.close()}
 }
})
