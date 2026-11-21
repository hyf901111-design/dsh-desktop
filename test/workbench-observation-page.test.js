import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {readFileSync} from 'node:fs'
import {observationComparison} from '../packages/dsh-research-task-runtime/workbench-observation-page.js'
import {prepareWorkbenchWebpages} from '../packages/dsh-research-task-runtime/workbench-webpage.js'
import {registerWorkbenchExecutionPolicy} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const request=readFileSync(new URL('./fixtures/workbench-yield-comparison.tsv.txt',import.meta.url),'utf8').trimEnd()
const defaultDateRequest=readFileSync(new URL('./fixtures/workbench-yield-default-dates.tsv.txt',import.meta.url),'utf8').trimEnd()
const plan={title:'年末曲线',panels:[{title:'利率复盘',type:'files',htmlFile:{name:'利率复盘.html',observationComparison:true}}]}
const render=request=>prepareWorkbenchWebpages(plan,'study',request)

it.each([request,defaultDateRequest])('binds a three-day public-source disclosure to the first native create request',async input=>{
 let guard,agent
 const hooks=new Map(),dispose=registerWorkbenchExecutionPolicy({tools:{guard:handler=>{guard=handler;return()=>{}}},systemPrompt:{context:()=>()=>{}},on:(n,fn)=>{hooks.set(n,fn);return()=>{}}})
 async function wire(text){
   const message={id:'msg',role:'user',source:{kind:'user',clientMode:'research'},content:[{type:'text',text}]}
   const session={id:'w',header:{},events:[{type:'user/message',data:message}]}
   agent={session}
   return hooks.get('agent/request-context')({agent,turn:1,signal:new AbortController().signal},async()=>({
     system:'base',tools:[{name:'research_workbench_create',parameters:{}},{name:'web_fetch',parameters:{}}],messages:[message]}))
 }
 try{
   const capture=await wire(input)
   expect(capture.tools.map(tool=>tool.name)).toEqual(['research_workbench_create'])
   expect(guard({agent,name:'research_workbench_create',arguments:{}})).toBeUndefined()
   expect(guard({agent,name:'web_fetch',arguments:{url:observationComparison(input).source}})).toBeTruthy()
   const recipe=capture.tools[0].parameters.properties.panels.items.properties.htmlFile
   expect(recipe.required).toEqual(['name','observationComparison'])
   expect(Object.keys(recipe.properties)).toEqual(['name','observationComparison'])
   expect(capture.system).toContain('"observationComparison":true')
   const native=await wire('创建一个研究看板上的原生折线卡，显示10年期收益率。\n'+request.slice(request.indexOf('来源：')))
   expect(native.system).not.toContain('"observationComparison":true')
 }finally{dispose()}
})

it('preserves the official rows, source and original precision, including sub-basis-point differences',async()=>{
 const first=render(request)
 expect(render(request).pages[0]).toEqual(first.pages[0])
 expect(first.args.panels[0].artifact).toMatchObject({type:'files',presentation:'webpage',items:[{relativePath:first.pages[0].relativePath}]})
 const other=request.replaceAll('年','期').replace('4.31','-0.00001').replace('4.62','0.00002')
 const win=new Window()
 try{
   win.document.write(render(other).pages[0].html)
   const doc=win.document
   new Function('document',doc.querySelector('script').textContent)(doc)
   expect(doc.querySelector('[data-difference=base]').textContent).toBe('0.003')
   expect(doc.querySelector('tbody').textContent).toContain('-0.00001%')
   const pair=doc.querySelector('select[name=pair]');pair.selectedIndex=1;pair.dispatchEvent(new win.Event('change'))
   expect(doc.querySelector('[data-difference=base]').textContent).toBe('37')
   expect(doc.querySelector('a').href).toContain('home.treasury.gov/')
 }finally{await win.happyDOM.abort()}
})

it.each([
 request.replace('10年减2年','未知年限减2年'),request.replace('4.62',''),request.replace('2024-12-27\t','2024-02-30\t'),
 request.replace('利率单位 %','金额单位元'),request.replace('；联动','，还需要久期和凸性；联动'),request.replace('断网也能带走的','')
])('leaves incomplete tables, unknown pairs and additional calculations to the general planner',text=>{
 expect(observationComparison(text)).toBeNull()
 expect(()=>render(text)).toThrow('其他比较')
})


it('resolves requested default dates from the actual records and retains the bare official URL',async()=>{
 const data=observationComparison(defaultDateRequest)
 expect(data.initial).toEqual({baseline:'2024-12-27',observation:'2024-12-31'})
 expect(data.publisher).toBe('美国财政部 Daily Treasury Par Yield Curve Rates')
 expect(data.source).toBe(defaultDateRequest.split('\n')[1])
 const other=defaultDateRequest.replace('12月27日至31日','12月30日至27日')
 const win=new Window()
 try {
   const doc=win.document
   doc.write(render(other).pages[0].html)
   new Function('document',doc.querySelector('script').textContent)(doc)
   expect(Array.from(doc.querySelectorAll('select'),s=>s.value)).toEqual(['2024-12-30','2024-12-27','0'])
   expect(Array.from(doc.querySelectorAll('output'),e=>Number(e.textContent))).toEqual([31,31,0])
   expect(doc.querySelector('footer a').href).toBe(data.source)
   expect(doc.querySelector('footer a').textContent).toBe(data.publisher)
 } finally {await win.happyDOM.abort()}
 for (const text of [
   defaultDateRequest.replace('12月27日至31日','12月26日至31日'),
   defaultDateRequest.replace('12月27日至31日','12月27日至最新日期'),
   defaultDateRequest.replace('保留来源','默认选择30年减5年，保留来源'),
   defaultDateRequest.replace('保留来源','还需要滑块回放，保留来源'),
   defaultDateRequest.replace('保留来源','需要联网核对来源'),
   defaultDateRequest.replace('保留来源','链接 https://example.com 与保留来源'),
   defaultDateRequest+'\n2025-12-27\t4.31\t4.45\t4.62\t4.82'
 ]) expect(observationComparison(text)).toBeNull()
})
