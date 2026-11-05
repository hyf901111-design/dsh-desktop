import {expect,it} from 'vitest'
import {JSDOM} from 'jsdom'
import {resolvePrototypeHtmlSnapshot} from '../packages/dsh-research-task-runtime/prototype-html-snapshot.js'
import {designPolicyIssue} from '../packages/dsh-research-task-runtime/design-policy.js'
import {sharedComponentIssue} from '../packages/dsh-research-task-runtime/shared-component-validation.js'

const file='/fixture/original.html'
const products={tool:'read_prototype',args:{file_path:file,section:'DATA.products'},response:{section:'DATA.products',offset:1,total:2,rows:[{name:'甲',a:30,b:70},{name:'乙',a:60,b:40}]}}
const channels={tool:'read_prototype',args:{file_path:file,section:'CH4'},response:{section:'CH4',offset:1,total:2,rows:[['渠道乙','#34C68E'],['渠道甲','#1E6FFF']]}}
const view={kind:'stacked-bars',source:'products',path:'rows',label:'name',unit:'%',series:[{field:'a',label:'渠道甲'},{field:'b',label:'渠道乙'}],palette:{source:'channels',path:'rows'}}
function resolve(config=view,records=[products,channels]){
 return resolvePrototypeHtmlSnapshot({version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args:products.args},{key:'channels',tool:'read_prototype',args:channels.args}],mapping:{version:1,type:'html',title:'渠道结构',view:config}},records)
}
it('preserves an observed legend by label across sections without changing source records or host UI roles',()=>{
 const before=JSON.stringify([products,channels]),artifact=resolve({kind:'sections',sections:[{label:'渠道',view},{label:'另一观察',view:{...view,palette:undefined}}]})
 expect(artifact).toBeTruthy();expect(designPolicyIssue(artifact.data.html)).toBeNull();expect(sharedComponentIssue(artifact.data.html,{required:true})).toBeUndefined()
 const dom=new JSDOM(artifact.data.html,{runScripts:'outside-only'}),w=dom.window;let definition,state,registrations=0
 try{
  w.sherlockShared={register(value){registrations++;definition=value;state=structuredClone(value.initialState);value.render(state,{connected:true,readOnly:false});return{dispatch(action){state=value.reduce(state,action);value.render(state,{connected:true,readOnly:false})}}}}
  for(const script of w.document.querySelectorAll('script:not([type])'))w.eval(script.textContent)
  const sections=w.document.querySelectorAll('.record-section'),colors=region=>[...region.querySelectorAll('.series-legend i')].map(node=>node.style.backgroundColor)
  expect(registrations).toBe(1);expect(colors(sections[0])).toEqual(['rgb(30, 111, 255)','rgb(52, 198, 142)'])
  expect(colors(sections[1])).toEqual(['var(--sherlock-chart-1)','var(--sherlock-chart-2)'])
  expect([...sections[0].querySelector('.track').querySelectorAll('.bar')].map(node=>node.style.width)).toEqual(['60%','40%'])
  expect([...sections[0].querySelector('.track').querySelectorAll('.bar')].map(node=>node.style.backgroundColor)).toEqual(colors(sections[0]))
  const restored=structuredClone(state);definition.render(restored,{connected:true,readOnly:true});expect(colors(sections[0])).toEqual(['rgb(30, 111, 255)','rgb(52, 198, 142)'])
  expect([...w.document.querySelectorAll('button')].every(node=>node.disabled)).toBe(true)
  expect(JSON.stringify([products,channels])).toBe(before)
 }finally{dom.window.close()}
})
it.each(['unobserved','unknown-label','extra-css','duplicate','incomplete','wrong-path','extra-property','not-stacked','raw-colors','injected-internal-palette'])('rejects an unsupported source palette: %s',kind=>{
 const config=structuredClone(view),records=structuredClone([products,channels])
 if(kind==='unobserved')config.palette.source='foreign'
 if(kind==='unknown-label')config.series[0].label='未观察渠道'
 if(kind==='extra-css')records[1].response.rows[0][1]='#34C68E;background:url(https://example.test)'
 if(kind==='duplicate')records[1].response.rows[0][0]='渠道甲'
 if(kind==='incomplete')records[1].response.nextOffset=3
 if(kind==='wrong-path')config.palette.path='constructor.prototype'
 if(kind==='extra-property')config.palette.color='#ff0000'
 if(kind==='not-stacked'){config.kind='bars';config.value='a';delete config.series}
 if(kind==='raw-colors')config.palette=['#ff0000','#00ff00']
 if(kind==='injected-internal-palette')config.nativePalette=['#ff0000','#00ff00']
 expect(resolve(config,records)).toBeNull()
})
