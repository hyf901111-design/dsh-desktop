import{expect,it}from'vitest'
import{JSDOM}from'jsdom'
import{prototypeRecordViewHtml,prototypeRecordViewIssue}from'../packages/dsh-research-task-runtime/prototype-record-view.js'
import{resolvePrototypeHtmlSnapshot}from'../packages/dsh-research-task-runtime/prototype-html-snapshot.js'
import{prototypeViewScaleIssue}from'../packages/dsh-research-task-runtime/prototype-presentation.js'
import{sharedComponentIssue}from'../packages/dsh-research-task-runtime/shared-component-validation.js'
const args={file_path:'/fixture/multi.html',section:'DATA.groups',limit:500},record={tool:'read_prototype',args,response:{section:args.section,value:{category:[{name:'债券',flow_1w:2,flow_1m:-4},{name:'股票',flow_1w:-1,flow_1m:8}],region:[{name:'中国',flow_1w:3,flow_1m:-2},{name:'美国',flow_1w:-5,flow_1m:7}]}}}
const single=path=>({source:'products',path:'value.'+path,kind:'bars',label:'name',value:'flow_1w',unit:'亿',periods:[{field:'flow_1w',label:'近1周'},{field:'flow_1m',label:'近1月'}],filters:[{field:'flow_1w',label:'方向',kind:'sign'}]})
const view={kind:'tabs',tabs:[{label:'分类',view:single('category')},{label:'地域',view:single('region')}]}
const sources=new Map([['sherlock-source-products',JSON.stringify(record.response)]])
const resolve=v=>resolvePrototypeHtmlSnapshot({version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'市场总览',view:v}},[record])
function browser(saved){
 const output=resolve(view);expect(output).toBeTruthy();expect(sharedComponentIssue(output.data.html,{required:true})).toBeUndefined()
 const dom=new JSDOM(output.data.html,{runScripts:'outside-only'}),win=dom.window;let state,definition,registrations=0
 const context={connected:true,readOnly:false}
 win.sherlockShared={register(value){registrations++;definition=value;state=saved??structuredClone(value.initialState);value.render(state,context);return{dispatch(action){state=value.reduce(state,action);value.render(state,context)}}}}
 for(const script of win.document.scripts)if(!script.type)win.eval(script.textContent)
 return{win,close:()=>win.close(),state:()=>structuredClone(state),registrations:()=>registrations,render:()=>definition.render(state,context),context}
}
it('keeps independent live window/filter state in one native shared container across tab changes and reopening',()=>{
 const b=browser(),d=b.win.document,tabs=d.querySelectorAll('[role=tab]'),panels=d.querySelectorAll('[role=tabpanel]')
 try{
  expect(b.registrations()).toBe(1);expect(panels[0].hidden).toBe(false);expect(panels[1].hidden).toBe(true)
  const window=panels[0].querySelector('[aria-label="统计窗口"]');window.value='flow_1m';window.dispatchEvent(new b.win.Event('change'))
  const direction=panels[0].querySelector('[aria-label="方向"]');direction.value='negative';direction.dispatchEvent(new b.win.Event('change'))
  expect(panels[0].querySelectorAll('.barrow')).toHaveLength(1);expect(panels[0].textContent).toContain('债券');expect(panels[0].textContent).toContain('-4.00亿')
  tabs[1].click();expect(panels[0].hidden).toBe(true);expect(panels[1].hidden).toBe(false);expect(panels[1].querySelectorAll('.barrow')).toHaveLength(2)
  tabs[0].click();expect(window.value).toBe('flow_1m');expect(direction.value).toBe('negative');expect(panels[0].querySelectorAll('.barrow')).toHaveLength(1)
  tabs[1].click();const reopened=browser(b.state());try{expect(reopened.state().activeTab).toBe(1);expect(reopened.state().views[0].filters.flow_1w).toBe('negative');expect(reopened.win.document.querySelectorAll('[role=tabpanel]')[0].hidden).toBe(true)}finally{reopened.close()}
  b.context.readOnly=true;b.render();expect([...tabs].every(tab=>tab.disabled)).toBe(true)
 }finally{b.close()}
})
it.each(['one-tab','duplicate-label','nested','unknown-source','missing-field','unknown-key'])('rejects unsupported multi-view configurations: %s',mode=>{
 const v=structuredClone(view)
 if(mode==='one-tab')v.tabs.pop()
 if(mode==='duplicate-label')v.tabs[1].label=v.tabs[0].label
 if(mode==='nested')v.tabs[0].view=view
 if(mode==='unknown-source')v.tabs[1].view.source='outside'
 if(mode==='missing-field')v.tabs[0].view.value='fabricated'
 if(mode==='unknown-key')v.extra='invalid'
 expect(prototypeRecordViewHtml(v,sources)).toBeNull()
})
it('checks every tab for source percentage scaling and handles malformed tabs without recursive expansion',()=>{
 const source={rows:[{ret:.1}],presentation:{numericFormats:[{field:'ret',scale:100,expression:'(r.ret*100).toFixed(2)'}]}},map=new Map([['sherlock-source-products',JSON.stringify(source)]]),table={source:'products',path:'rows',kind:'table',columns:[{field:'ret',label:'收益',unit:'%'}]}
 expect(prototypeViewScaleIssue({kind:'tabs',tabs:[{view:single('category')},{view:table}]},map)).toContain('当前为 1')
 expect(()=>prototypeViewScaleIssue({kind:'tabs',tabs:{}},map)).not.toThrow()
})
it('renders submitted bar precision and conversion consistently across values, axis, filters and period changes',()=>{
 const source={section:'DATA.groups',value:{by_geo:[{label:'甲',flow_1w:70.1234,flow_1m:-11.4},{label:'乙',flow_1w:-11.4567,flow_1m:5.2}]}},map=new Map([['sherlock-source-products',JSON.stringify(source)]]),bar={...single('by_geo'),label:'label',digits:3,scale:-2}
 const html=prototypeRecordViewHtml(bar,map);expect(html).toBeTruthy()
 const dom=new JSDOM(html,{runScripts:'outside-only'}),win=dom.window,d=win.document
 try{
  d.querySelector('#sherlock-source-products').textContent=JSON.stringify(source)
  win.sherlockShared={register(value){let state=structuredClone(value.initialState);const context={connected:true,readOnly:false};value.render(state,context);return{dispatch(action){state=value.reduce(state,action);value.render(state,context)}}}}
  for(const script of d.scripts)if(!script.type)win.eval(script.textContent)
  expect([...d.querySelectorAll('.barrow')].map(node=>node.textContent)).toEqual(['乙22.913亿','甲-140.247亿'])
  expect(d.querySelector('.axis').textContent).toContain('-140.247亿');expect(d.querySelector('.axis').textContent).toContain('140.247亿')
  const barNode=d.querySelector('.barrow .bar');expect(barNode.className).toContain('inflow');expect(barNode.style.left).toBe('50%')
  const direction=d.querySelector('[aria-label="方向"]');direction.value='positive';direction.dispatchEvent(new win.Event('change'))
  expect(d.querySelectorAll('.barrow')).toHaveLength(1);expect(d.querySelector('.barrow').textContent).toBe('乙22.913亿')
  const period=d.querySelector('[aria-label="统计窗口"]');period.value='flow_1m';period.dispatchEvent(new win.Event('change'))
  expect(d.querySelectorAll('.barrow')).toHaveLength(1);expect(d.querySelector('.barrow').textContent).toBe('甲22.800亿')
  expect(source.value.by_geo[0].flow_1w).toBe(70.1234)
 }finally{win.close()}
})
it('names an invalid field or tab instead of forcing a model to guess at a generic component rejection',()=>{
 const bad=structuredClone(view);bad.tabs[1].view.value='missing'
 expect(prototypeRecordViewIssue(bad,sources)).toContain('view.tabs[1]');expect(prototypeRecordViewIssue(bad,sources)).toContain('Observed row fields: name, flow_1w, flow_1m')
 for(const format of [{digits:7},{digits:1.5},{scale:0},{scale:Infinity}])expect(prototypeRecordViewHtml({...single('category'),...format},sources)).toBeNull()
 const known={rows:[{ret:.1}],presentation:{numericFormats:[{field:'ret',scale:100,expression:'(r.ret*100).toFixed(2)'}]}},map=new Map([['sherlock-source-products',JSON.stringify(known)]])
 expect(prototypeViewScaleIssue({source:'products',path:'rows',kind:'table',scale:100,columns:[{field:'ret',label:'收益',unit:'%'}]},map)).toBeUndefined()
 expect(prototypeViewScaleIssue({source:'products',path:'rows',kind:'bars',label:'ret',value:'ret',unit:'%',scale:1},map)).toContain('当前为 1')
})
