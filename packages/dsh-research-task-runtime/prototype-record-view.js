// A compact, reusable renderer over observed source rows. It never reads files,
// invents records, executes source scripts or creates a refresh recipe.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v,keys)=>object(v)&&Object.keys(v).every(key=>keys.includes(key))
const path=/^[\p{L}_$][\p{L}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{N}_$-]*)*$/u
const forbidden=new Set(['__proto__','prototype','constructor'])
const field=v=>typeof v==='string'&&v.length<=128&&path.test(v)&&v.split('.').every(key=>!forbidden.has(key))
function get(value,key){for(const part of key.split('.')){if(!object(value)||!Object.hasOwn(value,part))return;value=value[part]}return value}
const label=v=>typeof v==='string'&&v.trim()&&v.length<=100
const digits=v=>v===undefined||Number.isInteger(v)&&v>=0&&v<=6
const scale=v=>v===undefined||typeof v==='number'&&Number.isFinite(v)&&v!==0&&Math.abs(v)<=1e12
// Explicit source palettes preserve the meaning of a prototype's legend. Only
// inert, completely observed [label, hex] pairs can supply business chart colors;
// callers cannot pass arbitrary CSS or override the host controls and theme.
function observedPalette(palette,sources){
 if(!exact(palette,['source','path'])||typeof palette.source!=='string'||!field(palette.path))return null
 let response;try{response=JSON.parse(sources.get('sherlock-source-'+palette.source))}catch{return null}
 const rows=get(response,palette.path)
 if(!Array.isArray(rows)||rows.length<2||rows.length>6||!rows.every(row=>Array.isArray(row)&&row.length===2&&label(row[0])&&typeof row[1]==='string'&&/^#[\da-f]{6}$/iu.test(row[1]))||new Set(rows.map(row=>row[0])).size!==rows.length)return null
 return new Map(rows)
}
function columns(value,rows){
 return Array.isArray(value)&&value.length>0&&value.length<=24&&value.every(c=>exact(c,['field','label','unit','digits','scale'])&&field(c.field)&&label(c.label)&&(c.unit===undefined||label(c.unit))&&scale(c.scale)&&digits(c.digits)&&rows.some(row=>get(row,c.field)!==undefined))
}
// Pure source aggregation shared by validation tests and the browser renderer.
// Missing numeric observations stay missing; only an explicit count is zero.
export function groupObservedRecords(rows,config){
 const get=(value,key)=>key?.split('.').reduce((value,part)=>value&&Object.hasOwn(value,part)?value[part]:undefined,value)
 const included=[],groups=new Map()
 const summarize=members=>config.columns.map(column=>{
  if(column.operation==='count')return members.length
  const values=members.map(row=>get(row,column.field)).filter(value=>value!==undefined&&value!==null)
  if(column.operation==='any')return values.length?values.some(value=>value===true):undefined
  const numbers=values.filter(value=>typeof value==='number'&&Number.isFinite(value))
  return numbers.length?numbers.reduce((sum,value)=>sum+value,0):undefined
 })
 const missing=members=>config.columns.map(column=>column.operation==='count'?0:members.filter(row=>get(row,column.field)==null).length)
 for(const row of rows){
  const value=get(row,config.field),empty=value===undefined||value===null||value===''
  if(empty&&config.omitEmpty)continue
  const key=empty?'empty:':typeof value+':'+String(value)
  if(!groups.has(key))groups.set(key,{key,label:empty?'未分类':String(value),rows:[]})
  groups.get(key).rows.push(row);included.push(row)
 }
 return{groups:[...groups.values()].map(group=>({...group,values:summarize(group.rows),missing:missing(group.rows)})),included:included.length,total:summarize(included),totalMissing:missing(included)}
}
function groupingIssue(group,rows){
 if(!exact(group,['field','label','omitEmpty','columns'])||!field(group.field)||!label(group.label)||group.omitEmpty!==undefined&&typeof group.omitEmpty!=='boolean')return 'view.groupBy requires an observed scalar field, label, optional omitEmpty and aggregate columns.'
 const values=rows.map(row=>get(row,group.field)).filter(value=>value!==undefined&&value!==null)
 if(!values.length||!values.every(value=>['string','number','boolean'].includes(typeof value)))return 'view.groupBy.field must name an observed scalar field; arrays and objects need a custom presentation.'
 if(!Array.isArray(group.columns)||!group.columns.length||group.columns.length>12)return 'view.groupBy.columns requires 1–12 count/sum/any aggregates.'
 for(const column of group.columns){
  if(!exact(column,['field','label','operation','unit','digits','scale','trueLabel','falseLabel'])||!label(column.label)||!['count','sum','any'].includes(column.operation)||!digits(column.digits)||!scale(column.scale)||column.unit!==undefined&&!label(column.unit))return 'view.groupBy.columns must use count/sum/any, labels and valid numeric formats.'
  if(column.operation==='count'){
   if(column.field!==undefined||column.unit!==undefined||column.scale!==undefined||column.trueLabel!==undefined||column.falseLabel!==undefined)return 'A count aggregate has no source field, unit, scale or boolean labels.'
  }else{
   if(!field(column.field))return 'A sum/any aggregate must name an observed source field.'
   const observed=rows.map(row=>get(row,column.field)).filter(value=>value!==undefined&&value!==null)
   if(!observed.length||!observed.every(value=>column.operation==='sum'?typeof value==='number'&&Number.isFinite(value):typeof value==='boolean'))return 'Aggregate field '+JSON.stringify(column.field)+' must contain observed '+(column.operation==='sum'?'numbers':'booleans')+', not guessed/coerced values.'
   if(column.operation==='any'){
    if(column.scale!==undefined||column.unit!==undefined||column.digits!==undefined||[column.trueLabel,column.falseLabel].some(value=>value!==undefined&&!label(value)))return 'An any aggregate may use trueLabel/falseLabel, not numeric units or formats.'
   }else if(column.trueLabel!==undefined||column.falseLabel!==undefined)return 'Boolean labels apply only to an any aggregate.'
  }
 }
 const grouped=groupObservedRecords(rows,group)
 if([...grouped.groups.map(value=>value.values),grouped.total].some(values=>values.some((value,index)=>typeof value==='number'&&!Number.isFinite(value*(group.columns[index].scale??1)))))return 'Aggregate values exceed the finite numeric display range; use a source-backed calculation with a supported range.'
 return null
}
function recordViewIssue(view,sources){
 if(!exact(view,['source','path','kind','columns','label','value','unit','digits','scale','key','search','filters','periods','details','highlight','groupBy','series','palette']))return 'view contains unsupported properties.'
 if(!['table','bars','stacked-bars'].includes(view.kind))return 'view.kind must be table, bars or stacked-bars; use custom html for another presentation.'
 if(typeof view.source!=='string'||!sources.has('sherlock-source-'+view.source))return 'view.source must use an available host source alias.'
 if(!field(view.path))return 'view.path must be a safe dot path relative to the complete source response.'
 if(!digits(view.digits)||!scale(view.scale))return 'view.digits must be an integer from 0 to 6; view.scale must be a finite nonzero number with absolute value at most 1e12.'
 let response;try{response=JSON.parse(sources.get('sherlock-source-'+view.source))}catch{return 'The host source response is not valid JSON.'}
 const rows=get(response,view.path)
 if(!Array.isArray(rows)||!rows.length||rows.length>500||!rows.every(object))return 'view.path '+JSON.stringify(view.path)+' must resolve to a complete nonempty array of at most 500 source objects. Available root fields: '+Object.keys(response??{}).filter(key=>!forbidden.has(key)).slice(0,24).join(', ')+'.'
 const known=key=>field(key)&&rows.some(row=>get(row,key)!==undefined)
 const fields=[...new Set(rows.flatMap(row=>Object.keys(row)))].filter(key=>!forbidden.has(key)).slice(0,32).join(', ')
 if(view.kind==='table'&&!columns(view.columns,rows))return 'view.columns must name 1–24 observed fields with valid labels, units and numeric formats. Observed row fields: '+fields+'.'
 if(view.kind==='bars'&&(!known(view.label)||!known(view.value)))return 'view.label and view.value must name observed row fields. Observed row fields: '+fields+'.'
 if(view.kind==='stacked-bars'){
  if(!known(view.label)||view.periods!==undefined||view.details!==undefined||view.groupBy!==undefined)return 'stacked-bars needs an observed label; periods, details and groupBy belong in separate views.'
  if(!Array.isArray(view.series)||view.series.length<2||view.series.length>6||new Set(view.series.map(s=>s?.label)).size!==view.series.length)return 'view.series requires 2–6 uniquely labelled source series.'
  if(new Set(view.series.map(series=>series?.unit??view.unit??'')).size>1)return 'Stacked series share one numeric axis and must use the same unit; put different units in separate views.'
  for(const series of view.series){
   if(!exact(series,['field','subtract','label','unit','digits','scale'])||!known(series.field)||!label(series.label)||!digits(series.digits)||!scale(series.scale)||series.unit!==undefined&&!label(series.unit)||series.subtract!==undefined&&!known(series.subtract))return 'Each stacked series needs an observed numeric field, label, optional formats and optional subtract field. Observed row fields: '+fields+'.'
   for(const key of [series.field,series.subtract].filter(Boolean)){
    const values=rows.map(row=>get(row,key)).filter(value=>value!=null)
    if(!values.length||values.some(value=>typeof value!=='number'||!Number.isFinite(value)))return 'Stacked series field '+JSON.stringify(key)+' must contain observed finite numbers, not coerced text.'
   }
   if(rows.some(row=>{const a=get(row,series.field),b=series.subtract===undefined?0:get(row,series.subtract);return a!=null&&b!=null&&!Number.isFinite((a-b)*(series.scale??view.scale??1))}))return 'Stacked series values exceed the finite display range.'
  }
  if(view.palette!==undefined){
   const colors=observedPalette(view.palette,sources)
   if(!colors||view.series.some(series=>!colors.has(series.label)))return 'view.palette must reference an already observed source/path containing 2–6 unique [series label, #RRGGBB] pairs. Every series label must match that source legend exactly; do not copy colors into the configuration.'
  }
  const totals=rows.map(row=>{const values=view.series.map(series=>{const a=get(row,series.field),b=series.subtract===undefined?0:get(row,series.subtract);return a==null||b==null?0:(a-b)*(series.scale??view.scale??1)});return{positive:values.filter(value=>value>0).reduce((sum,value)=>sum+value,0),negative:values.filter(value=>value<0).reduce((sum,value)=>sum+value,0)}})
  if(totals.some(total=>!Number.isFinite(total.positive)||!Number.isFinite(total.negative))||!Number.isFinite(Math.max(0,...totals.map(total=>total.positive))-Math.min(0,...totals.map(total=>total.negative))))return 'Stacked totals exceed the finite display range.'
 }else if(view.series!==undefined||view.palette!==undefined)return 'view.series and view.palette are supported only by stacked-bars.'
 if(view.unit!==undefined&&!label(view.unit)||view.key!==undefined&&!known(view.key)||view.value!==undefined&&!known(view.value))return 'view.unit must be a nonempty label; view.key and view.value must name observed row fields.'
 if(view.search!==undefined&&(!Array.isArray(view.search)||view.search.length>8||!view.search.every(known)))return 'view.search may contain at most 8 observed row fields. Observed row fields: '+fields+'.'
 if(view.filters!==undefined&&(!Array.isArray(view.filters)||view.filters.length>6||!view.filters.every(f=>exact(f,['field','label','kind'])&&known(f.field)&&label(f.label)&&['category','sign'].includes(f.kind))))return 'view.filters may contain at most 6 category/sign filters over observed row fields. Observed row fields: '+fields+'.'
 if(view.periods!==undefined&&(!Array.isArray(view.periods)||view.periods.length>12||!view.periods.every(p=>exact(p,['field','label'])&&known(p.field)&&label(p.label))))return 'view.periods may contain at most 12 labelled observed fields. Observed row fields: '+fields+'.'
 if(view.groupBy!==undefined){
  if(view.kind!=='table'||view.details!==undefined||view.periods!==undefined)return 'view.groupBy uses a table with source member columns; nested details or period views need a separate view or custom html.'
  const issue=groupingIssue(view.groupBy,rows);if(issue)return issue
 }
 if(view.details!==undefined){
  if(!object(view.details))return 'view.details must describe an observed nested array or keyed objects.'
  if(view.details.fields!==undefined){
   if(!exact(view.details,['fields','label'])||!label(view.details.label)||!columns(view.details.fields,rows)||!view.details.fields.every(f=>rows.some(row=>object(get(row,f.field)))&&rows.every(row=>get(row,f.field)===undefined||object(get(row,f.field)))))return 'view.details.fields must reference observed keyed objects; include details.label and valid column formats.'
  }else{
   if(!field(view.details.field))return 'view.details.field must name an observed nested array.'
   const detailRows=rows.flatMap(row=>Array.isArray(get(row,view.details.field))?get(row,view.details.field):[])
   if(!exact(view.details,['field','columns'])||!detailRows.length||!columns(view.details.columns,detailRows))return 'view.details.field must resolve to nested records; details.columns must name their observed fields.'
  }
 }
 if(view.highlight!==undefined&&(!view.key||!Array.isArray(view.highlight)||view.highlight.length>20||!view.highlight.every(v=>typeof v==='string'&&v.length<=128)))return 'view.highlight requires an observed key and at most 20 string identifiers.'
 return null
}
export function prototypeRecordViewIssue(view,sources){
 if(['tabs','sections'].includes(view?.kind)){
  const key=view.kind==='tabs'?'tabs':'sections',parts=view[key]
  if(!exact(view,['kind',key])||!Array.isArray(parts)||parts.length<2||parts.length>8||new Set(parts.map(part=>part?.label)).size!==parts.length||!parts.every(part=>exact(part,['label','view'])&&label(part.label)))return 'view.'+key+' requires 2–8 uniquely labelled, non-nested table, bars or stacked-bars views.'
  for(let i=0;i<parts.length;i++){const issue=recordViewIssue(parts[i].view,sources);if(issue)return 'view.'+key+'['+i+']: '+issue}
  return null
 }
 return recordViewIssue(view,sources)
}
const COMPOSITE_STYLE='.record-sections>.record-section+.record-section{margin-top:20px;padding-top:14px;border-top:1px solid var(--sherlock-border)}.record-section h2{font:600 14px/22px var(--sherlock-font-sans);margin:0 0 8px}.series-legend{display:flex;gap:8px 14px;flex-wrap:wrap;margin-bottom:8px;color:var(--sherlock-muted);font-size:11px}.series-legend>span{display:inline-flex;gap:5px;align-items:center}.series-legend i{width:10px;height:10px;flex:none}.stacked-row{grid-template-columns:minmax(100px,1fr) minmax(120px,3fr);gap:3px 8px}.stacked-row>span:first-child{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.stacked-values{grid-column:2;font-size:11px;line-height:17px;color:var(--sherlock-muted);text-align:left;overflow-wrap:anywhere}.stacked-view .axis{margin-right:0;display:block;position:relative;height:18px}.stacked-view .axis>span{position:absolute}.stacked-row .bar{min-width:0}.stacked-row .track{height:18px}@media(max-width:460px){.stacked-row{grid-template-columns:minmax(0,1fr)}.stacked-values{grid-column:1}.stacked-view .axis{margin-left:0}}'
export function prototypeRecordViewHtml(view,sources,{restoreSortOnRepeat=false}={}){
 if(prototypeRecordViewIssue(view,sources))return null
 const ownedConfig=view=>{
  if(['tabs','sections'].includes(view.kind)){const key=view.kind==='tabs'?'tabs':'sections';return{...view,[key]:view[key].map(part=>({...part,view:ownedConfig(part.view)}))}}
  if(!view.palette)return view
  const colors=observedPalette(view.palette,sources)
  return{...view,nativePalette:view.series.map(series=>colors.get(series.label))}
 }
 const json=JSON.stringify({...ownedConfig(view),...restoreSortOnRepeat?{nativeSortResetOnRepeat:true}:{}}).replace(/[<>&\u2028\u2029]/gu,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))
 return '<!doctype html><html><head><meta charset="utf-8"><style>'+STYLE+COMPOSITE_STYLE+'</style></head><body data-sherlock-source-view><div id="view-tabs" role="tablist" hidden></div><div id="view-body"><div class="controls" id="controls"></div><div id="summary"></div><section id="content"></section><nav id="pages"></nav></div><script id="sherlock-view-config" type="application/json">'+json+'</script>'+[...sources.keys()].map(id=>'<script id="'+id+'" type="application/json"></script>').join('')+'<script>('+sourceRecordView.toString()+')('+groupObservedRecords.toString()+');</script></body></html>'
}
const STYLE='[hidden]{display:none!important}#view-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}#view-tabs button[aria-selected="true"]{background:var(--sherlock-row-selected);border-color:var(--sherlock-control-border)}body{margin:0;padding:12px;font:13px/20px var(--sherlock-font-sans);color:var(--sherlock-text);background:var(--sherlock-surface);font-variant-numeric:tabular-nums}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}button,input,select{font:inherit;color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border);border-radius:4px;min-height:28px;padding:3px 8px}button{cursor:pointer}button:hover{background:var(--sherlock-surface-muted)}button:disabled{opacity:.5;cursor:default}input{min-width:120px;flex:1}label{display:flex;align-items:center;gap:6px}.summary,#summary{color:var(--sherlock-muted);font-size:11px;margin-bottom:6px}.content,#content{overflow-x:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{padding:7px 10px;text-align:left;border-bottom:1px solid var(--sherlock-border)}th button{border:0;background:transparent;padding:0;min-height:20px;font-weight:600}.number{text-align:right}.inflow{color:var(--sherlock-status-danger-fg)}.outflow{color:var(--sherlock-status-success-fg)}tr.highlight{background:var(--sherlock-row-selected)}.details{padding:8px 12px;background:var(--sherlock-surface-muted)}.barrow{display:grid;grid-template-columns:minmax(86px,1fr) minmax(120px,3fr) 80px;gap:8px;align-items:center;padding:7px 0}.track{position:relative;height:16px;border-left:1px solid var(--sherlock-border);border-right:1px solid var(--sherlock-border)}.zero{position:absolute;left:50%;height:100%;border-left:1px solid var(--sherlock-muted)}.bar{position:absolute;height:100%;min-width:1px}.bar.inflow{background:var(--sherlock-status-danger-fg)}.bar.outflow{background:var(--sherlock-status-success-fg)}.axis{margin:0 88px 0 calc(25% + 8px);display:flex;justify-content:space-between;color:var(--sherlock-muted);font-size:11px}nav{display:flex;justify-content:flex-end;gap:8px;align-items:center;padding-top:8px}aside{font-size:11px;color:var(--sherlock-muted);border-top:1px solid var(--sherlock-border);margin-top:10px;padding-top:8px}'

// Native single-series bars cannot represent a requested decomposition. This
// narrow suitability check prevents a partial shortcut from closing generation;
// custom HTML remains available for requirements beyond these native views.
export function prototypeRecordViewRequirementIssue(view,request=''){
 const clauses=request.split(/[①-⑳]|\n\s*\d+[.)、]/u)
 const stacked=/(?:堆叠[条柱图]|(?:双层|多层)(?:水平)?条形|stacked\s+(?:bar|column))/iu
 const needed=clauses.filter(clause=>stacked.test(clause)&&!/(?:不要|无需|不用|不需要|非|不使用|without|not)\s*(?:[\p{L}\p{N}]{0,4}\s*)?(?:堆叠|双层|多层|stacked)/iu.test(clause)).length
 const parts=view?.kind==='tabs'?view.tabs:view?.kind==='sections'?view.sections:undefined
 const available=Array.isArray(parts)?parts.filter(part=>part?.view?.kind==='stacked-bars').length:view?.kind==='stacked-bars'?1:0
 if(needed>available)return '本卡明确要求'+needed+'处多序列堆叠/拆分图，但当前 view 仅包含'+available+'处；单序列总变化条不能代替拆分或渠道结构。请保留全部区域，用 sections/tabs 组合 stacked-bars（series 字段，可用 subtract 表示两个已观察数值之差），或改用完整自定义 html。'
 return null
}

function sourceRecordView(groupRows){
 const config=JSON.parse(document.getElementById('sherlock-view-config').textContent)
 const restoreOnRepeat=config.nativeSortResetOnRepeat===true
 const el=(tag,text,parent)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent?.append(node);return node}
 const root=document.getElementById('view-body')
 let shared,definition
 if(!['tabs','sections'].includes(config.kind))definition=mount(config,root,action=>shared.dispatch(action))
 else{
  root.replaceChildren()
  root.classList.toggle('record-sections',config.kind==='sections')
  const tabbed=config.kind==='tabs',nav=document.getElementById('view-tabs');nav.hidden=!tabbed
  const children=(tabbed?config.tabs:config.sections).map((tab,index)=>{
   const panel=el('section',undefined,root);panel.className='record-section'
   const button=tabbed?el('button',tab.label,nav):null
   if(button){button.setAttribute('role','tab');button.id='view-tab-'+index;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id)}
   else{const heading=el('h2',tab.label,panel);heading.id='view-section-'+index;panel.setAttribute('aria-labelledby',heading.id)}
   for(const [tag,cls] of [['div','controls'],['div','summary'],['section','content'],['nav','pages']])el(tag,undefined,panel).className=cls
   if(button)button.onclick=()=>shared.dispatch({type:'tab',index})
   return{button,panel,definition:mount(tab.view,panel,action=>shared.dispatch({type:'view',index,action}))}
  })
  definition={
   initialState:{activeTab:0,views:children.map(child=>child.definition.initialState)},
   reduce:(state,action)=>action.type==='tab'&&Number.isInteger(action.index)&&children[action.index]?{...state,activeTab:action.index}:action.type==='view'&&Number.isInteger(action.index)&&children[action.index]?{...state,views:state.views.map((value,index)=>index===action.index?children[index].definition.reduce(value,action.action):value)}:state,
   render:(state,context)=>{children.forEach((child,index)=>{child.panel.hidden=tabbed&&index!==state.activeTab;if(child.button){child.button.setAttribute('aria-selected',String(index===state.activeTab));child.button.disabled=context.readOnly||!context.connected}child.definition.render(state.views[index],context)})}
  }
 }
 shared=window.sherlockShared.register({initialState:definition.initialState,reduce:(state,action)=>definition.reduce(state,action),render:(state,context)=>definition.render(state,context)})
 function mount(config,root,send){
 if(config.kind==='stacked-bars')root.classList.add('stacked-view')
 const source=JSON.parse(document.getElementById('sherlock-source-'+config.source).textContent)
 const get=(row,key)=>key.split('.').reduce((v,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,row)
 const records=get(source,config.path),controls=root.querySelector('.controls'),content=root.querySelector('.content')??root.querySelector('#content'),pages=root.querySelector('.pages')??root.querySelector('#pages'),summary=root.querySelector('.summary')??root.querySelector('#summary')
 const el=(tag,text,parent)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent?.append(node);return node}
 const text=(value,c={})=>value===undefined||value===null||value===''?'—':typeof value==='number'?(value*(c.scale??1)).toLocaleString('zh-CN',{minimumFractionDigits:c.digits??2,maximumFractionDigits:c.digits??2})+(c.unit??''):String(value)
 const search=config.search?.length?el('input',undefined,controls):null
 if(search){search.type='search';search.placeholder='搜索代码或名称';search.setAttribute('aria-label','搜索代码或名称')}
 const filters=(config.filters??[]).map(filter=>{const wrap=el('label',filter.label,controls),select=el('select',undefined,wrap);select.setAttribute('aria-label',filter.label);el('option','全部',select).value='';if(filter.kind==='sign'){el('option','净流入',select).value='positive';el('option','净流出',select).value='negative'}else for(const value of [...new Set(records.map(row=>get(row,filter.field)))].filter(v=>v!==undefined&&v!==null&&v!=='').sort())el('option',String(value),select).value=String(value);return{...filter,select}})
 let period
 if(config.periods?.length){period=el('select',undefined,el('label','统计窗口',controls));period.setAttribute('aria-label','统计窗口');for(const p of config.periods)el('option',p.label,period).value=p.field}
 const sort=el('button','切换排序',controls);sort.setAttribute('aria-label','切换排序')
 const initialSort=config.value??config.columns?.find(c=>records.some(r=>typeof get(r,c.field)==='number'))?.field??config.key??config.series?.[0].field??config.columns[0].field
 const initialGroupSort=config.groupBy?.columns.findIndex(column=>column.operation==='sum'&&column.field===initialSort)??-1
 const shared={dispatch:send}
 const definition={
  initialState:{query:'',filters:{},period:config.periods?.[0]?.field??config.value??'',sort:initialSort,descending:true,page:0,expanded:[],groupSort:initialGroupSort,expandedGroups:[]},
  reduce:(s,a)=>a.type==='group'?{...s,expandedGroups:s.expandedGroups.includes(a.key)?s.expandedGroups.filter(key=>key!==a.key):[...s.expandedGroups,a.key]}:a.type==='groupSort'?{...s,groupSort:a.index,descending:a.index===s.groupSort?!s.descending:true,page:0}:a.type==='expand'?{...s,expanded:s.expanded.includes(a.index)?s.expanded.filter(v=>v!==a.index):[...s.expanded,a.index]}:a.type==='sort'?restoreOnRepeat&&a.field?{...s,sort:s.lastSortField===a.field?initialSort:a.field,descending:true,lastSortField:s.lastSortField===a.field?'':a.field,page:0}:{...s,sort:a.field??s.sort,descending:a.field&&a.field!==s.sort?true:!s.descending,lastSortField:'',page:0}:a.type==='filter'?{...s,filters:{...s.filters,[a.field]:a.value},page:0}:a.type==='query'?{...s,query:a.value,page:0}:a.type==='period'?{...s,period:a.field,sort:a.field,page:0}:a.type==='page'?{...s,page:a.page}:s,
  render:(state,context)=>{
   const disabled=context.readOnly||!context.connected
   if(search){search.value=state.query;search.disabled=disabled}for(const f of filters){f.select.value=state.filters[f.field]??'';f.select.disabled=disabled}if(period){period.value=state.period;period.disabled=disabled}sort.disabled=disabled;sort.textContent=state.descending?'降序 ↓':'升序 ↑'
   const valueField=state.period||config.value
   const barValue=row=>{const v=get(row,valueField);return typeof v==='number'?v*(config.scale??1):v}
   let selected=records.map((row,index)=>({row,index})).filter(({row})=>(!state.query||(config.search??[]).some(key=>String(get(row,key)??'').toLowerCase().includes(state.query.toLowerCase())))&&filters.every(f=>{const choice=state.filters[f.field];if(!choice)return true;const value=config.kind==='bars'&&f.kind==='sign'?barValue(row):get(row,f.field);return f.kind==='sign'?typeof value==='number'&&(choice==='positive'?value>0:value<0):String(value)===choice}))
   selected.sort((a,b)=>{const x=get(a.row,state.sort),y=get(b.row,state.sort);if(x==null)return y==null?0:1;if(y==null)return-1;return(typeof x==='number'&&typeof y==='number'?(x-y)*(config.kind==='bars'?(config.scale??1):1):String(x).localeCompare(String(y),'zh-CN',{numeric:true}))*(state.descending?-1:1)})
   summary.textContent=selected.length+' / '+records.length+' 项';content.replaceChildren();pages.replaceChildren()
   if(config.groupBy){renderGroups(selected.map(item=>item.row),state,disabled);return}
   if(config.kind==='stacked-bars'){renderStacked(selected);return}
   if(config.kind==='bars'){
    const maximum=Math.max(0,...selected.map(({row})=>Math.abs(Number(barValue(row))||0)))||1,axis=el('div',undefined,content);axis.className='axis';for(const value of [-maximum,0,maximum])el('span',text(value,{unit:config.unit,digits:config.digits}),axis)
    for(const {row} of selected){const line=el('div',undefined,content);line.className='barrow';el('span',text(get(row,config.label)),line);const track=el('div',undefined,line);track.className='track';el('span',undefined,track).className='zero';const value=barValue(row),bar=el('span',undefined,track),positive=typeof value==='number'&&value>=0;bar.className='bar '+(positive?'inflow':'outflow');bar.hidden=typeof value!=='number'||value===0;if(typeof value==='number'){bar.style.left=(positive?50:50-Math.abs(value)/maximum*50)+'%';bar.style.width=Math.abs(value)/maximum*50+'%'}const label=el('span',text(value,{unit:config.unit,digits:config.digits}),line);label.className='number '+(positive?'inflow':'outflow')}
    return
   }
   const table=el('table',undefined,content),thead=el('thead',undefined,table),head=el('tr',undefined,thead),tbody=el('tbody',undefined,table)
   if(config.details)el('th','',head)
   for(const c of config.columns){const th=el('th',undefined,head),button=el('button',c.label+(c.field===state.sort?(state.descending?' ↓':' ↑'):''),th);button.disabled=disabled;button.onclick=()=>shared.dispatch({type:'sort',field:c.field})}
   const maxPage=Math.max(0,Math.ceil(selected.length/25)-1),current=Math.min(state.page,maxPage)
   for(const {row,index} of selected.slice(current*25,current*25+25)){
    const tr=el('tr',undefined,tbody);if(config.highlight?.includes(String(get(row,config.key))))tr.className='highlight'
    if(config.details){const button=el('button',state.expanded.includes(index)?'−':'+',el('td',undefined,tr));button.setAttribute('aria-label','展开明细 '+text(config.key?get(row,config.key):index+1));button.disabled=disabled;button.onclick=()=>shared.dispatch({type:'expand',index})}
    for(const c of config.columns){const value=get(row,c.field),td=el('td',text(value,{digits:config.digits,scale:config.scale,...c}),tr);if(typeof value==='number')td.className='number';if(/flow|净流/u.test(c.field)&&typeof value==='number'&&value!==0)td.className+=' '+(value>=0?'inflow':'outflow')}
    if(config.details&&state.expanded.includes(index)){
     const td=el('td',undefined,el('tr',undefined,tbody));td.colSpan=config.columns.length+1;td.className='details';const nested=el('table',undefined,td),nh=el('tr',undefined,el('thead',undefined,nested)),nb=el('tbody',undefined,nested)
     if(config.details.fields){el('th',config.details.label,nh);for(const c of config.details.fields)el('th',c.label,nh);const keys=[...new Set(config.details.fields.flatMap(c=>Object.keys(get(row,c.field)??{})))];for(const key of keys){const nr=el('tr',undefined,nb);el('td',key,nr);for(const c of config.details.fields)el('td',text(get(row,c.field)?.[key],c),nr)}}
     else{for(const c of config.details.columns)el('th',c.label,nh);for(const detail of get(row,config.details.field)??[]){const nr=el('tr',undefined,nb);for(const c of config.details.columns)el('td',text(get(detail,c.field),c),nr)}}
    }
   }
   if(selected.length>25){const previous=el('button','上一页',pages),count=el('span',(current+1)+' / '+(maxPage+1),pages),next=el('button','下一页',pages);previous.disabled=disabled||!current;next.disabled=disabled||current===maxPage;previous.onclick=()=>shared.dispatch({type:'page',page:current-1});next.onclick=()=>shared.dispatch({type:'page',page:current+1})}
  }
 }
 function renderStacked(selected){
   const palette=config.nativePalette??Array.from({length:6},(_,index)=>'var(--sherlock-chart-'+(index+1)+')')
  const legend=el('div',undefined,content);legend.className='series-legend'
  config.series.forEach((series,index)=>{const item=el('span',undefined,legend),swatch=el('i',undefined,item);swatch.style.backgroundColor=palette[index];el('span',series.label+(series.unit??config.unit?'（'+(series.unit??config.unit)+'）':''),item)})
  const data=selected.map(({row})=>({row,values:config.series.map(series=>{const a=get(row,series.field),b=series.subtract===undefined?0:get(row,series.subtract);return typeof a==='number'&&typeof b==='number'?(a-b)*(series.scale??config.scale??1):undefined})}))
  const minimum=Math.min(0,...data.map(item=>item.values.reduce((sum,value)=>sum+(value<0?value:0),0)))
  const maximum=Math.max(0,...data.map(item=>item.values.reduce((sum,value)=>sum+(value>0?value:0),0)))
  const span=maximum-minimum||1,origin=-minimum/span*100
  const axis=el('div',undefined,content);axis.className='axis';const ticks=minimum===maximum?[0]:[minimum,...minimum<0&&maximum>0?[0]:[],maximum];ticks.forEach((value,index)=>{const tick=el('span',text(value,{unit:config.unit,digits:config.digits}),axis);tick.style.left=((value-minimum)/span*100)+'%';tick.style.transform=index===0?'none':index===ticks.length-1?'translateX(-100%)':'translateX(-50%)'})
  for(const item of data){
   const line=el('div',undefined,content);line.className='barrow stacked-row';el('span',text(get(item.row,config.label)),line)
   const track=el('div',undefined,line);track.className='track';track.setAttribute('role','img')
   const zero=el('span',undefined,track);zero.className='zero';zero.style.left=origin+'%'
   let positive=0,negative=0
   const descriptions=[]
   item.values.forEach((value,index)=>{
    const series=config.series[index],description=series.label+' '+text(value,{unit:series.unit??config.unit,digits:series.digits??config.digits});descriptions.push(description)
    if(value===undefined||value===0)return
    const segment=el('span',undefined,track);segment.className='bar stacked-segment';segment.style.backgroundColor=palette[index];segment.style.left=((-minimum+(value>0?positive:negative+value))/span*100)+'%';segment.style.width=Math.abs(value)/span*100+'%';segment.title=description
    if(value>0)positive+=value;else negative+=value
   })
   track.setAttribute('aria-label',descriptions.join('；'))
   const values=el('span',descriptions.join(' · '),line);values.className='stacked-values'
  }
 }
 function renderGroups(selected,state,disabled){
  const spec=config.groupBy,grouped=groupRows(selected,spec)
  const compare=(x,y)=>x==null?(y==null?0:1):y==null?-1:(typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'zh-CN',{numeric:true}))*(state.descending?-1:1)
  const groupValue=group=>{const value=state.groupSort<0?group.label:group.values[state.groupSort];return typeof value==='number'?value*(spec.columns[state.groupSort]?.scale??1):value}
  grouped.groups.sort((a,b)=>compare(groupValue(a),groupValue(b)))
  summary.textContent=grouped.groups.length+' 组 · '+grouped.included+' / '+records.length+' 项'+(spec.omitEmpty?' · 不含分组字段为空的记录':'')
  const table=el('table',undefined,content),head=el('tr',undefined,el('thead',undefined,table)),body=el('tbody',undefined,table)
  for(const [index,column] of [{label:spec.label},...spec.columns].entries()){
   const button=el('button',column.label+(state.groupSort===index-1?(state.descending?' ↓':' ↑'):''),el('th',undefined,head));button.disabled=disabled;button.onclick=()=>shared.dispatch({type:'groupSort',index:index-1})
  }
  const cells=(parent,values,missing)=>{for(const [index,column] of spec.columns.entries()){const value=values[index],label=value===undefined?'—':column.operation==='any'?(value?column.trueLabel??'是':column.falseLabel??'否'):text(value,{digits:column.operation==='count'?0:undefined,...column}),td=el('td',label+(value!==undefined&&missing[index]?'（'+missing[index]+'项缺失）':''),parent);if(typeof value==='number')td.className='number';if(/flow|净流/u.test(column.field??'')&&typeof value==='number'&&value!==0)td.className+=' '+(value>=0?'inflow':'outflow')}}
  const maxPage=Math.max(0,Math.ceil(grouped.groups.length/25)-1),current=Math.min(state.page,maxPage)
  for(const group of grouped.groups.slice(current*25,current*25+25)){
   const row=el('tr',undefined,body),open=state.expandedGroups.includes(group.key),button=el('button',(open?'▾ ':'▸ ')+group.label,el('td',undefined,row))
   button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label','展开分组 '+group.label);button.disabled=disabled;const toggle=()=>{if(!disabled)shared.dispatch({type:'group',key:group.key})};button.onclick=event=>{event.stopPropagation();toggle()};row.onclick=toggle;cells(row,group.values,group.missing)
   if(!open)continue
   const td=el('td',undefined,el('tr',undefined,body));td.colSpan=spec.columns.length+1;td.className='details'
   const nested=el('table',undefined,td),nh=el('tr',undefined,el('thead',undefined,nested)),nb=el('tbody',undefined,nested)
   for(const column of config.columns){const button=el('button',column.label+(column.field===state.sort?(state.descending?' ↓':' ↑'):''),el('th',undefined,nh));button.disabled=disabled;button.onclick=()=>shared.dispatch({type:'sort',field:column.field})}
   const members=[...group.rows].sort((a,b)=>{const x=get(a,state.sort),y=get(b,state.sort);return compare(x,y)})
   for(const member of members){const tr=el('tr',undefined,nb);if(config.highlight?.includes(String(get(member,config.key))))tr.className='highlight';for(const column of config.columns){const value=get(member,column.field),cell=el('td',text(value,{digits:config.digits,scale:config.scale,...column}),tr);if(typeof value==='number')cell.className='number'}}
  }
  const footer=el('tr',undefined,el('tfoot',undefined,table));el('th','合计',footer);cells(footer,grouped.total,grouped.totalMissing)
  if(grouped.groups.length>25){const previous=el('button','上一页',pages);el('span',(current+1)+' / '+(maxPage+1),pages);const next=el('button','下一页',pages);previous.disabled=disabled||!current;next.disabled=disabled||current===maxPage;previous.onclick=()=>shared.dispatch({type:'page',page:current-1});next.onclick=()=>shared.dispatch({type:'page',page:current+1})}
 }
 if(search)search.addEventListener('input',()=>shared.dispatch({type:'query',value:search.value}));for(const f of filters)f.select.onchange=()=>shared.dispatch({type:'filter',field:f.field,value:f.select.value});if(period)period.onchange=()=>shared.dispatch({type:'period',field:period.value});sort.onclick=()=>shared.dispatch({type:'sort'})
 return definition
 }
}

export const PROTOTYPE_GROUP_VIEW_PROMPT='分组汇总可复用table的groupBy:{field:"真实分组字段",label:"分组名",omitEmpty?:true,columns:[{operation:"count",label:"数量"},{operation:"sum",field:"真实数值字段",label:"规模",unit:"原单位",digits:2},{operation:"any",field:"真实布尔字段",label:"是否包含",trueLabel:"是",falseLabel:"否"}]}；view.columns配置展开后的原始成员列，view.value选择初始排序字段，保留search/filters/key/highlight。宿主在筛选后汇总并提供分组排序、合计和成员展开，不用重写HTML或预先计算/抄写分组数值。omitEmpty仅在源逻辑明确排除空分组时设true；缺失数值不补零，sum不将数字文本猜成数值。聚合字段单位和scale须与来源口径一致；需额外自定义交互仍可用完整html，不删减原需求。'
