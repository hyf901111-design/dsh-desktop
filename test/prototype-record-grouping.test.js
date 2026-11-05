import {expect,it} from 'vitest'
import {JSDOM} from 'jsdom'
import {groupObservedRecords,prototypeRecordViewIssue} from '../packages/dsh-research-task-runtime/prototype-record-view.js'
import {resolvePrototypeHtmlSnapshot} from '../packages/dsh-research-task-runtime/prototype-html-snapshot.js'
import {prototypeViewScaleIssue} from '../packages/dsh-research-task-runtime/prototype-presentation.js'
import {sharedComponentIssue} from '../packages/dsh-research-task-runtime/shared-component-validation.js'

const rows=[
 {code:'03483',name:'甲产品',tag:'红利',flow:2,scale:12,ours:true,ret:.1},
 {code:'00300',name:'乙产品',tag:'红利',flow:-1,scale:8,ours:false,ret:-.1},
 {code:'00100',name:'丙产品',tag:'科技',flow:4,scale:20,ours:false,ret:.2},
 {code:'00000',name:'未分组',tag:'',flow:100,scale:200,ours:false,ret:0},
 {code:'01234',name:'缺失值',tag:'待核实',flow:null,scale:null,ours:null,ret:null}
]
const args={file_path:'/fixture/grouped-products.html',section:'DATA.products',offset:1,limit:500}
const record={tool:'read_prototype',args,response:{section:args.section,offset:1,total:rows.length,rows,presentation:{numericFormats:[{field:'ret',scale:100,expression:'(r.ret*100).toFixed(1)'},{field:'scale',scale:1,context:['资产规模（亿）']}]}}}
const spec={field:'tag',label:'赛道',omitEmpty:true,columns:[{operation:'count',label:'产品数'},{operation:'sum',field:'scale',label:'规模',unit:'亿',digits:1},{operation:'sum',field:'flow',label:'净流入',unit:'亿',digits:2},{operation:'any',field:'ours',label:'我司',trueLabel:'在池',falseLabel:'—'}]}
const view={source:'products',path:'rows',kind:'table',key:'code',value:'flow',columns:[{field:'code',label:'代码'},{field:'name',label:'名称'},{field:'flow',label:'净流入',unit:'亿'},{field:'ret',label:'收益',unit:'%',scale:100,digits:1}],search:['code','name'],filters:[{field:'ours',label:'我司',kind:'category'}],highlight:['03483'],groupBy:spec}
const sources=new Map([['sherlock-source-products',JSON.stringify(record.response)]])
const resolve=v=>resolvePrototypeHtmlSnapshot({version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'源记录分组',view:v}},[record])

it('aggregates only actual members, preserves missing observations and never mutates the source',()=>{
 const before=structuredClone(rows),result=groupObservedRecords(rows,spec)
 expect(result.included).toBe(4);expect(result.total).toEqual([4,40,5,true])
 expect(result.groups.find(g=>g.label==='红利')).toMatchObject({values:[2,20,1,true],rows:rows.slice(0,2)})
 expect(result.groups.find(g=>g.label==='待核实').values).toEqual([1,undefined,undefined,undefined]);expect(rows).toEqual(before)
 expect(groupObservedRecords([{tag:0,flow:0},{tag:false,flow:0},{tag:'0',flow:0},{tag:'',flow:0}],{field:'tag',columns:[{operation:'sum',field:'flow'}]}).groups.map(g=>g.key)).toEqual(['number:0','boolean:false','string:0','empty:'])
})
function browser(v=view,saved){
 const output=resolve(v);expect(output).toBeTruthy();expect(sharedComponentIssue(output.data.html,{required:true})).toBeUndefined()
 const dom=new JSDOM(output.data.html,{runScripts:'outside-only'}),win=dom.window,context={connected:true,readOnly:false};let state,definition
 win.sherlockShared={register(value){definition=value;state=saved??structuredClone(value.initialState);value.render(state,context);return{dispatch(action){state=value.reduce(state,action);value.render(state,context)}}}}
 for(const script of win.document.scripts)if(!script.type)win.eval(script.textContent)
 return{d:win.document,win,context,state:()=>structuredClone(state),render:()=>definition.render(state,context),close:()=>win.close()}
}
it('shows grouped totals and real expandable members, with persisted expansion, search, source filters and read-only state',()=>{
 const b=browser(),d=b.d
 try{
  expect(d.querySelector('#summary').textContent).toContain('3 组 · 4 / 5 项')
  expect(d.querySelector('tfoot').textContent).toContain('40.0亿');expect(d.querySelector('tfoot').textContent).toContain('5.00亿')
  d.querySelector('[aria-label="展开分组 红利"]').click();expect(d.querySelector('.details .highlight').textContent).toContain('03483');expect(d.querySelector('.details').textContent).toContain('10.0%')
  const reopened=browser(view,b.state());try{expect(reopened.d.querySelector('[aria-label="展开分组 红利"]').getAttribute('aria-expanded')).toBe('true')}finally{reopened.close()}
  const search=d.querySelector('input');search.value='00300';search.dispatchEvent(new b.win.Event('input'));expect(d.querySelector('#summary').textContent).toContain('1 组 · 1 / 5 项');expect(d.querySelector('.details').textContent).not.toContain('03483');expect(d.querySelector('tfoot').textContent).toContain('-1.00亿')
  search.value='';search.dispatchEvent(new b.win.Event('input'));const filter=d.querySelector('[aria-label="我司"]');filter.value='false';filter.dispatchEvent(new b.win.Event('change'));expect(d.querySelector('#summary').textContent).toContain('2 组 · 2 / 5 项');expect(d.querySelector('tfoot').textContent).toContain('3.00亿')
  b.context.readOnly=true;b.render();expect([...d.querySelectorAll('button,input,select')].every(node=>node.disabled)).toBe(true)
 }finally{b.close()}
})
it('sorts groups and members without losing code identities or treating missing totals as zero',()=>{
 const b=browser(),d=b.d
 try{
  const labels=()=>[...d.querySelectorAll('tbody>tr>td>button')].map(button=>button.textContent)
  expect(labels()[0]).toContain('科技');expect(labels().at(-1)).toContain('待核实')
  const header=()=>[...d.querySelectorAll('thead button')].find(button=>button.textContent.includes('净流入'))
  header().click();expect(labels()[0]).toContain('红利');expect(labels().at(-1)).toContain('待核实')
  d.querySelector('[aria-label="展开分组 红利"]').closest('tr').click();expect(d.querySelector('.details tbody tr').textContent).toContain('00300')
  const cells=[...d.querySelector('[aria-label="展开分组 待核实"]').closest('tr').cells].map(cell=>cell.textContent);expect(cells.slice(1)).toEqual(['1','—','—','—'])
 }finally{b.close()}
})
it.each([
 ['unknown grouping field',v=>v.groupBy.field='missing'],['unsafe grouping path',v=>v.groupBy.field='constructor.name'],
 ['unexpected property',v=>v.groupBy.calculated=[999]],['unobserved aggregate field',v=>v.groupBy.columns[1].field='invented'],
 ['numeric coercion',v=>v.groupBy.columns[1].field='code'],['boolean coercion',v=>v.groupBy.columns[3].field='flow'],
 ['count source',v=>v.groupBy.columns[0].field='code'],['unknown aggregate',v=>v.groupBy.columns[1].operation='execute'],
 ['boolean scale',v=>v.groupBy.columns[3].scale=100],['invalid precision',v=>v.groupBy.columns[1].digits=8],
 ['nested group field',v=>v.groupBy.field='nested'],['bars grouping',v=>{v.kind='bars';v.label='name'}],
 ['mixed details',v=>v.details={field:'name'}],['mixed periods',v=>v.periods=[{field:'flow',label:'本周'}]]
])('rejects invalid source aggregation: %s',(_name,change)=>{const v=structuredClone(view);change(v);expect(prototypeRecordViewIssue(v,sources)).toBeTruthy();expect(resolve(v)).toBeNull()})
it('rejects overflow and percentage or monetary meaning changes in aggregate columns',()=>{
 const v=structuredClone(view),s=new Map([['sherlock-source-products',JSON.stringify({rows:[{tag:'甲',value:1e308},{tag:'甲',value:1e308}]})]])
 v.columns=[{field:'tag',label:'类别'}];v.groupBy.columns=[{operation:'sum',field:'value',label:'合计'}];delete v.value;delete v.key;delete v.search;delete v.filters;delete v.highlight
 expect(prototypeRecordViewIssue(v,s)).toContain('finite numeric')
 const bad=structuredClone(view);bad.groupBy.columns=[{operation:'sum',field:'ret',label:'收益',unit:'%'}];expect(prototypeViewScaleIssue(bad,sources)).toContain('当前为 1');bad.groupBy.columns[0].scale=100;expect(prototypeViewScaleIssue(bad,sources)).toBeUndefined()
 bad.groupBy.columns=[{operation:'sum',field:'scale',label:'份额变动'}];expect(prototypeViewScaleIssue(bad,sources)).toContain('资产规模')
})
it('retains independent grouped views in a tab container',()=>{
 const b=browser({kind:'tabs',tabs:[{label:'赛道',view},{label:'产品',view:{...view,groupBy:undefined}}]})
 try{const tabs=b.d.querySelectorAll('[role=tab]');b.d.querySelector('[aria-label="展开分组 红利"]').click();tabs[1].click();expect(b.d.querySelectorAll('[role=tabpanel]')[1].textContent).toContain('03483');tabs[0].click();expect(b.d.querySelector('[aria-label="展开分组 红利"]').getAttribute('aria-expanded')).toBe('true')}finally{b.close()}
})
it('marks partially missing aggregate totals and produces a clean empty filtered state',()=>{
 const b=browser(),d=b.d
 try{
  expect(d.querySelector('tfoot').textContent).toContain('40.0亿（1项缺失）')
  const search=d.querySelector('input');search.value='no source match';search.dispatchEvent(new b.win.Event('input'))
  expect(d.querySelector('#summary').textContent).toContain('0 组 · 0 / 5 项');expect(d.querySelector('tbody').children).toHaveLength(0);expect(d.querySelector('tfoot').textContent).not.toContain('0.00亿')
 }finally{b.close()}
})
it('paginates source groups and renders hostile source text without interpreting it as markup',()=>{
 const source={rows:Array.from({length:30},(_,i)=>({tag:i===0?'<img src=x onerror=alert(1)>':'组'+i,flow:i}))},map=new Map([['sherlock-source-products',JSON.stringify(source)]])
 const v={source:'products',path:'rows',kind:'table',columns:[{field:'tag',label:'组名'}],value:'flow',groupBy:{field:'tag',label:'组名',columns:[{operation:'sum',field:'flow',label:'净流入'}]}}
 // This fixture uses the same renderer but an independent observed source.
 const {data}=resolvePrototypeHtmlSnapshot({version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'分组分页',view:v}},[{...record,response:{...record.response,rows:source.rows,total:source.rows.length}}])
 const dom=new JSDOM(data.html,{runScripts:'outside-only'}),win=dom.window,d=win.document
 try{
  win.sherlockShared={register(definition){let state=structuredClone(definition.initialState);const context={connected:true,readOnly:false};definition.render(state,context);return{dispatch(action){state=definition.reduce(state,action);definition.render(state,context)}}}}
  for(const script of d.scripts)if(!script.type)win.eval(script.textContent)
  expect(prototypeRecordViewIssue(v,map)).toBeNull();expect(d.querySelector('tbody').children).toHaveLength(25);expect(d.querySelector('nav').textContent).toContain('1 / 2')
  d.querySelector('nav button:last-child').click();expect(d.querySelector('tbody').children).toHaveLength(5);expect(d.querySelector('nav').textContent).toContain('2 / 2');expect(d.querySelector('tbody').textContent).toContain('<img src=x onerror=alert(1)>');expect(d.querySelector('img')).toBeNull()
 }finally{win.close()}
})
