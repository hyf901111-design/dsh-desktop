import {expect,it} from 'vitest'
import {JSDOM} from 'jsdom'
import {prototypeRecordViewIssue,prototypeRecordViewRequirementIssue} from '../packages/dsh-research-task-runtime/prototype-record-view.js'
import {resolvePrototypeHtmlSnapshot} from '../packages/dsh-research-task-runtime/prototype-html-snapshot.js'
import {prototypeViewScaleIssue} from '../packages/dsh-research-task-runtime/prototype-presentation.js'
import {sharedComponentIssue} from '../packages/dsh-research-task-runtime/shared-component-validation.js'
import {designPolicyIssue} from '../packages/dsh-research-task-runtime/design-policy.js'

const args={file_path:'/fixture/original.html',section:'DATA.ours',limit:500}
const record={tool:'read_prototype',args,response:{section:args.section,offset:1,total:3,rows:[{code:'03489',name:'人工智能',flow:.3073,change:.1208,pct:{甲:60.62,乙:39.38}},{code:'03483',name:'亚太高股息',flow:-.1137,change:-.1074,pct:{甲:55.56,乙:44.44}},{code:'00000',name:'缺失记录',flow:null,change:.2,pct:{甲:null,乙:100}}]}}
const sources=new Map([['sherlock-source-products',JSON.stringify(record.response)]])
const table={source:'products',path:'rows',kind:'table',key:'code',value:'flow',columns:[{field:'code',label:'代码'},{field:'flow',label:'净流入',unit:'亿'}],search:['code'],highlight:['03489','03483']}
const bars={source:'products',path:'rows',kind:'stacked-bars',key:'code',label:'code',value:'flow',unit:'亿',series:[{field:'flow',label:'净流入'},{field:'change',subtract:'flow',label:'净值与分红'}]}
const channels={...bars,unit:'%',series:[{field:'pct.甲',label:'渠道甲'},{field:'pct.乙',label:'渠道乙'}]}
const view={kind:'sections',sections:[{label:'指标总表',view:table},{label:'规模拆分',view:bars},{label:'渠道结构',view:channels}]}
const requirement='①指标总表；②净流入与净值变化的双层水平条形；③渠道结构堆叠条。'
const candidate=spec=>({version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'来源业务',view:spec}})
const resolve=(spec=view,options={})=>resolvePrototypeHtmlSnapshot(candidate(spec),[record],options)
function browser(saved,options={}){
 const artifact=resolve(view,options);expect(artifact).toBeTruthy()
 expect(sharedComponentIssue(artifact.data.html,{required:true})).toBeUndefined();expect(designPolicyIssue(artifact.data.html)).toBeNull()
 const dom=new JSDOM(artifact.data.html,{runScripts:'outside-only'}),w=dom.window;let state,definition,count=0
 const context={connected:true,readOnly:false}
 w.sherlockShared={register(config){count++;definition=config;state=saved??structuredClone(config.initialState);config.render(state,context);return{dispatch(action){state=config.reduce(state,action);config.render(state,context)}}}}
 for(const script of w.document.scripts)if(!script.type)w.eval(script.textContent)
 return{dom,w,d:w.document,context,state:()=>structuredClone(state),count:()=>count,render:()=>definition.render(state,context),close:()=>w.close()}
}
it('renders all requested regions with one shared registration, exact source differences and missing values intact',()=>{
 const original=JSON.stringify(record),b=browser()
 try{
  expect(b.count()).toBe(1);expect(b.d.querySelectorAll('[role=tab]')).toHaveLength(0)
  const regions=b.d.querySelectorAll('.record-section');expect(regions).toHaveLength(3);expect([...regions].every(region=>!region.hidden)).toBe(true)
  expect([...regions[0].querySelectorAll('tr.highlight td:first-child')].map(node=>node.textContent)).toEqual(['03489','03483'])
  const rows=regions[1].querySelectorAll('.stacked-row');expect(rows).toHaveLength(3)
  expect(rows[0].textContent).toContain('净流入 0.31亿');expect(rows[0].textContent).toContain('净值与分红 -0.19亿')
  expect(rows[1].textContent).toContain('净流入 -0.11亿');expect(rows[1].textContent).toContain('净值与分红 0.01亿')
  expect(rows[2].querySelector('.track').getAttribute('aria-label')).toBe('净流入 —；净值与分红 —');expect(rows[2].querySelectorAll('.bar')).toHaveLength(0)
  const geometry=[...rows[0].querySelectorAll('.bar')].map(node=>({left:parseFloat(node.style.left),width:parseFloat(node.style.width)}))
  expect(geometry).toHaveLength(2);expect(geometry[1].left).toBeCloseTo(0);expect(geometry[0].left).toBeCloseTo(geometry[1].width)
  expect(geometry[0].left+geometry[0].width).toBeCloseTo(100)
  const ticks=regions[1].querySelectorAll('.axis>span');expect(ticks).toHaveLength(3)
  expect(parseFloat(ticks[1].style.left)).toBeCloseTo(geometry[0].left);expect(ticks[1].style.transform).toBe('translateX(-50%)')
  const percentage=regions[2].querySelector('.track');expect(percentage.getAttribute('aria-label')).toBe('渠道甲 60.62%；渠道乙 39.38%')
  const parts=percentage.querySelectorAll('.bar');expect(parseFloat(parts[0].style.width)).toBeCloseTo(60.62);expect(parseFloat(parts[1].style.width)).toBeCloseTo(39.38)
  expect(JSON.stringify(record)).toBe(original)
 }finally{b.close()}
})
it('restores the configured default on a repeated header click only when the real request requires it',()=>{
 const b=browser(undefined,{panelRequest:'点表头排序、再点恢复默认'})
 try{
  const header=()=>b.d.querySelector('th button');header().click();expect(b.state().views[0].sort).toBe('code')
  header().click();expect(b.state().views[0]).toMatchObject({sort:'flow',descending:true,lastSortField:''})
  const reopened=browser(b.state(),{panelRequest:'点表头排序、再点恢复默认'})
  try{expect(reopened.state().views[0].sort).toBe('flow')}finally{reopened.close()}
 }finally{b.close()}
 const standard=browser();try{standard.d.querySelector('th button').click();standard.d.querySelector('th button').click();expect(standard.state().views[0]).toMatchObject({sort:'code',descending:false})}finally{standard.close()}
})
it('keeps section controls independent, restores saved state and disables mutation in read-only context',()=>{
 const b=browser()
 try{
  const input=b.d.querySelector('input');input.value='03483';input.dispatchEvent(new b.w.Event('input'))
  const regions=b.d.querySelectorAll('.record-section');expect(regions[0].querySelectorAll('tbody tr')).toHaveLength(1);expect(regions[1].querySelectorAll('.stacked-row')).toHaveLength(3)
  regions[1].querySelector('button').click()
  const reopened=browser(b.state());try{expect(reopened.d.querySelector('input').value).toBe('03483');expect(reopened.state().views[1].descending).toBe(false)}finally{reopened.close()}
  b.context.readOnly=true;b.render();expect([...b.d.querySelectorAll('input,button')].every(control=>control.disabled)).toBe(true)
 }finally{b.close()}
})
it.each(['unobserved','coerced','mixed-unit','overflow','axis-overflow','nested','duplicate-label','invalid-difference'])('rejects invalid composed source views: %s',mode=>{
 const bad=structuredClone(view),source=structuredClone(record.response)
 if(mode==='unobserved')bad.sections[1].view.series[0].field='invented'
 if(mode==='coerced')source.rows[0].flow='0.3073'
 if(mode==='mixed-unit')bad.sections[1].view.series[1].unit='%'
 if(mode==='overflow'){source.rows[0].flow=1e308;source.rows[0].change=1e308;delete bad.sections[1].view.series[1].subtract}
 if(mode==='axis-overflow'){source.rows[0].flow=1e308;source.rows[1].flow=-1e308;source.rows[0].change=source.rows[1].change=0;delete bad.sections[1].view.series[1].subtract}
 if(mode==='nested')bad.sections[1].view=view
 if(mode==='duplicate-label')bad.sections[1].label=bad.sections[0].label
 if(mode==='invalid-difference')bad.sections[1].view.series[1].subtract='notObserved'
 expect(prototypeRecordViewIssue(bad,new Map([['sherlock-source-products',JSON.stringify(source)]]))).toBeTruthy()
})
it('does not acknowledge a partial shortcut that replaces two requested decompositions with one total-value bar',()=>{
 const partial={kind:'tabs',tabs:[{label:'指标',view:table},{label:'规模',view:{source:'products',path:'rows',kind:'bars',label:'code',value:'change'}}]}
 expect(prototypeRecordViewRequirementIssue(partial,requirement)).toContain('明确要求2处')
 let issue;expect(resolve(partial,{panelRequest:requirement,onPrototypeViewIssue:value=>{issue=value}})).toBeNull();expect(issue).toContain('不能代替拆分或渠道结构')
 expect(resolve(view,{panelRequest:requirement})).toBeTruthy()
 expect(prototypeRecordViewRequirementIssue(table,'不要堆叠条形图，只需表格')).toBeNull()
 expect(prototypeRecordViewRequirementIssue(table,'Do not use stacked bars, show a table.')).toBeNull()
})
it('preserves observed percentage scaling in every stacked series and in difference operands',()=>{
 const source={...record.response,presentation:{numericFormats:[{field:'flow',scale:100,expression:'(r.flow*100).toFixed(2)'}]}},map=new Map([['sherlock-source-products',JSON.stringify(source)]])
 expect(prototypeViewScaleIssue({...bars,unit:'%'},map)).toContain('当前为 1')
 expect(prototypeViewScaleIssue({...bars,unit:'%',scale:100},map)).toBeUndefined()
})
