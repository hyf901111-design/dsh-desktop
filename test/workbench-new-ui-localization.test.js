import {afterEach,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {localizedWorkbenchFunctions,workbenchText} from '../scripts/lib/workbench-localization.mjs'
import {ComponentDataSettingsPanel} from '../scripts/lib/component-data-settings-panel.mjs'
import {componentDataStatusView,componentDataSourceNames,componentRssStatusView,createComponentDataStatusStore} from '../scripts/lib/component-data-status.mjs'
import {newsSourceScopeIssue} from '../packages/dsh-research-task-runtime/news-source-scope.js'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {publishResearchWorkbenchProgress,observeResearchWorkbenchProgress,workbenchProgressState,requestResearchWorkbenchRetry} from '../scripts/lib/research-workbench-feedback.mjs'

const scopeError=()=>newsSourceScopeIssue({type:'news'},[{tool:'public_data_query',args:{source:'sina-news'}}],'只关注原主题')
const localized=fn=>localizedWorkbenchFunctions(fn.toString())[0]?.after
let current
afterEach(async()=>{await current?.dispose();current=undefined})

it('translates recently added component menu, refresh and source status copy',()=>{
 for(const [zh,en] of [
  ['已检查 · 数据无变化','Checked · Data unchanged'],['正在更新数据…','Updating data…'],
  ['尚未读取订阅源','Feed not fetched yet'],['读取失败 · 保留上次条目','Fetch failed · Previous items retained'],
  ['修改音频网址','Edit audio URL'],['重新加载音源','Reload audio'],['打开原视频','Open original video'],
  ['重置页面大小','Reset page zoom'],['刷新行情与资讯','Refresh market data'],['已请求重新载入组件','Component reload requested'],
  ['刷新尚未完成，保留上次数据','Refresh pending; previous data retained'],['等待下一次更新','Waiting for next refresh'],
  ['每 1 小时','Every 1 hour'],['每 5 分钟','Every 5 minutes'],['基于所选 1 个组件','Based on 1 selected component']
 ])expect(workbenchText(zh,'en')).toBe(en)
 expect(workbenchText(scopeError(),'en')).toContain('Regenerate this component')
 expect(workbenchText('用户中文新闻与分析原文','en')).toBe('用户中文新闻与分析原文')
})

it('localizes the actual settings and RSS helpers while preserving source fields',()=>{
 const panel=localized(ComponentDataSettingsPanel),rss=localized(componentRssStatusView)
 expect(panel).toContain('useWorkbenchLocale()');expect(panel).toContain('workbenchText(error||binding.error)')
 expect(panel).not.toContain('workbenchText(title)');expect(panel).not.toContain('workbenchText(binding.dataAsOf)')
 expect(rss).toContain('workbenchText("尚未读取订阅源")')
 const rssView=new Function('workbenchText','return '+rss)(text=>workbenchText(text,'en'))
 expect(rssView({containerSpec:{html:'<script id="sherlock-template-data" type="application/json">{"templateId":"rss","data":{"feeds":[{"title":"用户订阅源名称","url":"https://example.org/feed"}]}}</script>'}})).toMatchObject({time:'Not fetched yet',detail:'Feed not fetched yet',title:'用户订阅源名称：Fetched Not fetched yet'})
 const statusSource=localized(componentDataStatusView),status=new Function('componentDataSourceNames','workbenchText','return '+statusSource)(componentDataSourceNames,text=>workbenchText(text,'en'))
 expect(status({status:'unchanged',enabled:true,intervalMinutes:1,sourceNames:['用户中文来源']},'unchanged')).toMatchObject({detail:'Checked · Data unchanged',source:'用户中文来源'})
 const generation=readFileSync('scripts/lib/figma-generation-client.mjs','utf8'),range=localizedWorkbenchFunctions(generation).find(row=>row.name==='ResearchGenerationProcess')
 expect(range.after).toContain('workbenchText(researchPublicProgress(node.generationError')
 expect(range.after).toContain("workbenchText('基于所选 ' + sourceCount + ' 个组件')")
 expect(range.after).not.toContain('workbenchText(researchPublicProgress(node.title')
})

it('switches the real source settings and fixed topic error live without changing saved content',async()=>{
 const binding={id:'b',nodeId:'news-topic',status:'error',enabled:true,intervalMinutes:1,nextRun:null,error:scopeError(),dataAsOf:'用户保存的数据说明',requests:[{toolId:'public_data_query',sourceName:'用户中文来源'}]}
 const f=await financialClientFixture({componentData:{setVisible:async()=>{},request:async(_session,args)=>args.action==='list'?[binding]:binding}},{refreshState:true});current=f
 const html='<p>用户保存的中文新闻原文</p>'
 await f.act(async()=>{const node=f.workspace.createFinancialWidget('watchlist');binding.nodeId=node.id;f.workspace.setArtifacts([{...node,title:'用户中文标题',containerPrompt:'用户中文研究需求',containerSpec:{version:1,type:'html',title:'用户中文标题',html}}]);f.document.documentElement.dataset.odysseyLocale='en'})
 await f.event('click',f.host.querySelector('[data-workbench-more]'))
 const source=[...f.document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent.includes('Data sources and auto refresh'))
 expect(source).toBeDefined();await f.event('click',source)
 await f.act(async()=>{await vi.waitFor(()=>expect(f.document.querySelector('.odyssey-data-settings [role=alert]')?.textContent).toContain('Regenerate this component'))})
 const panel=f.document.querySelector('.odyssey-data-settings')
 expect(panel.textContent).toContain('Refresh interval');expect(panel.textContent).toContain('Waiting for next refresh')
 expect(panel.querySelector('select').textContent).toContain('Every 1 hour')
 expect(panel.textContent).toContain('用户中文来源');expect(panel.textContent).toContain('用户保存的数据说明')
 expect(panel.querySelector('[data-ui-preserve]').textContent).toBe('用户中文标题')
 await f.act(async()=>{f.document.documentElement.dataset.odysseyLocale='zh';await new Promise(resolve=>setTimeout(resolve,10))})
 expect(panel.querySelector('[role=alert]').textContent).toBe(scopeError())
 const saved=f.workspace.getSnapshot().artifacts.find(node=>node.id===binding.nodeId)
 expect(saved.containerPrompt).toBe('用户中文研究需求');expect(saved.containerSpec.html).toBe(html)
})

it('updates an open generation receipt and retry action immediately when the UI language changes',async()=>{
 const f=await financialClientFixture();current=f
 const require=createRequire(import.meta.url),React=require('react'),{createRoot}=require('react-dom/client')
 const source=readFileSync('scripts/lib/research-workbench-feedback.mjs','utf8'),start=source.indexOf('function ResearchWorkbenchProgress('),end=source.indexOf('\nexport function patchResearchWorkbenchFeedback',start)
 const Component=new Function('react','react_jsx_runtime','window','document','MutationObserver','observeResearchWorkbenchProgress','workbenchProgressState','requestResearchWorkbenchRetry','componentDataStatusStore','return '+source.slice(start,end))(React,require('react/jsx-runtime'),f.win,f.document,f.win.MutationObserver,observeResearchWorkbenchProgress,workbenchProgressState,requestResearchWorkbenchRetry,createComponentDataStatusStore())
 const snapshot=publishResearchWorkbenchProgress(f.win,'receipt-locale',[{id:'failed',kind:'generated-container',workbenchId:'p',generationStatus:'failed',title:'用户中文标题',generationError:'用户提供的失败说明'}])
 const host=f.document.createElement('div');f.document.body.append(host);const root=createRoot(host)
 try{
  await f.act(async()=>root.render(React.createElement(Component,{sessionId:'receipt-locale',plans:[{id:'p',count:1}]})))
  expect(host.textContent).toContain('组件生成已结束');expect(host.querySelector('button').textContent).toBe('重试')
  await f.act(async()=>{f.document.documentElement.dataset.odysseyLocale='en';await new Promise(resolve=>setTimeout(resolve,10))})
  expect(host.textContent).toContain('Generation ended');expect(host.querySelector('button').getAttribute('aria-label')).toBe('Retry unsuccessful components')
  expect(f.win.__sherlockWorkbenchGenerationV1.get('receipt-locale')).toBe(snapshot)
  await f.act(async()=>{f.document.documentElement.dataset.odysseyLocale='zh';await new Promise(resolve=>setTimeout(resolve,10))})
  expect(host.querySelector('button').textContent).toBe('重试')
 }finally{await f.act(async()=>root.unmount())}
})
