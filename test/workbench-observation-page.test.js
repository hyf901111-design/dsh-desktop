import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {readFileSync} from 'node:fs'
import {observationComparison} from '../packages/dsh-research-task-runtime/workbench-observation-page.js'
import {prepareWorkbenchWebpages} from '../packages/dsh-research-task-runtime/workbench-webpage.js'
import {registerWorkbenchExecutionPolicy} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const request=readFileSync(new URL('./fixtures/workbench-yield-comparison.tsv.txt',import.meta.url),'utf8').trimEnd()
const plan={title:'年末曲线',panels:[{title:'利率复盘',type:'files',htmlFile:{name:'利率复盘.html',observationComparison:true}}]}
const render=request=>prepareWorkbenchWebpages(plan,'study',request)

it('plans the real three-day request with a small file recipe and preserves an ordinary chart request',async()=>{
 const hooks=new Map(),dispose=registerWorkbenchExecutionPolicy({tools:{guard:()=>()=>{}},systemPrompt:{context:()=>()=>{}},on:(n,fn)=>{hooks.set(n,fn);return()=>{}}})
 async function wire(text){
   const message={id:'msg',role:'user',source:{kind:'user'},content:[{type:'text',text}]}
   const session={id:'w',header:{},events:[{type:'user/message',data:message}]},agent={session}
   return hooks.get('agent/request-context')({agent,turn:1,signal:new AbortController().signal},async()=>({
     system:'base',tools:[{name:'research_workbench_create',parameters:{}},{name:'web_fetch',parameters:{}}],messages:[message]}))
 }
 try{
   const capture=await wire(request)
   expect(capture.tools.map(tool=>tool.name)).toEqual(['research_workbench_create'])
   expect(capture.tools[0].parameters.properties.panels.items.properties.htmlFile.properties).toHaveProperty('observationComparison')
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
