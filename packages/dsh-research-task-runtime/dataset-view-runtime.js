export function datasetViewValue(value,field){
 if(value===null||value===undefined)return '未提供'
 if(Array.isArray(value))return value.length?value.map(v=>'• '+v).join('\n'):'（无条目）'
 if(typeof value==='boolean')return value?'是':'否'
 if(value==='')return '（空）'
 return String(value)+(typeof value==='number'&&field?.unit?' '+field.unit:'')
}
export function datasetViewSchedule(dataset,section){
 const entries=dataset.records.map(record=>({record,a:record[section.start]===null?NaN:Date.parse(record[section.start]),b:record[section.end]===null?NaN:Date.parse(record[section.end])}))
 const timed=entries.filter(e=>Number.isFinite(e.a)&&Number.isFinite(e.b)),first=timed.length?Math.min(...timed.map(e=>e.a)):0,last=timed.length?Math.max(...timed.map(e=>e.b)):0,span=Math.max(1,last-first)
 const sample=timed[0]?.record[section.start]??'',zone=sample.match(/([+-])(\d{2}):(\d{2})$/),offset=zone?(zone[1]==='-'?-1:1)*(Number(zone[2])*60+Number(zone[3])):0
 const ticks=timed.length?Array.from({length:last>first?5:1},(_,i)=>{const d=new Date(first+(last-first)*i/4+offset*60000).toISOString();return {time:new Date(first+(last-first)*i/4).toISOString(),label:d.slice(5,10)+(sample.includes('T')?' '+d.slice(11,16):'')}}):[]
 const rows=entries.map(e=>{
  const missing=!Number.isFinite(e.a)||!Number.isFinite(e.b),resource=section.resource?e.record[section.resource]:null
  const conflicts=missing||!section.resource||resource===null||resource===''?[]:entries.filter(other=>other!==e&&other.record[section.resource]===resource&&Number.isFinite(other.a)&&Number.isFinite(other.b)&&e.a<e.b&&other.a<other.b&&e.a<other.b&&e.b>other.a).map(other=>other.record.id)
  return {id:e.record.id,label:e.record[section.label],owner:section.owner?e.record[section.owner]:null,missing,conflicts,left:missing?0:(e.a-first)/span*100,width:missing?0:Math.max(.25,(e.b-e.a)/span*100)}
 })
 return {rows,ticks,zone:timed.length?(sample.includes('T')?(zone?'UTC'+zone[0]:sample.endsWith('Z')?'UTC':''):'日期'):''}
}
// Serialized into the existing opaque HTML sandbox. Values always come from
// the canonical source; state holds only view choices and record identities.
export function datasetViewRuntime(valueText){
 const source=document.getElementById('dataset-view-source'),root=document.querySelector('.dv-shell')
 if(!source||!root||!window.sherlockShared)return
 const spec=JSON.parse(source.textContent),data=spec.dataset,view=spec.view,records=new Map(data.records.map(r=>[r.id,r])),ids=[...records.keys()],fields=new Map(data.fields.map(f=>[f.key,f]))
 const token=value=>JSON.stringify(value)
 const filterOptions=new Map(view.filters.map(key=>[key,[...new Map(data.records.map(r=>[token(r[key]),valueText(r[key],fields.get(key))])).entries()]]))
 const searchText=new Map(data.records.map(r=>[r.id,data.fields.map(f=>valueText(r[f.key],f)).join(' ').toLocaleLowerCase()]))
 function normalize(raw){
  const order=[...new Set((Array.isArray(raw?.order)?raw.order:[]).filter(id=>records.has(id)))];for(const id of ids)if(!order.includes(id))order.push(id)
  const filters={};for(const key of view.filters){const value=raw?.filters?.[key];filters[key]=filterOptions.get(key).some(([v])=>v===value)?value:''}
  const query=typeof raw?.query==='string'?raw.query.slice(0,256):'',pageSize=[10,20,50,100].includes(raw?.pageSize)?raw.pageSize:20
  const visible=order.filter(id=>searchText.get(id).includes(query.toLocaleLowerCase())&&view.filters.every(key=>!filters[key]||token(records.get(id)[key])===filters[key]))
  const pages=Object.fromEntries(view.sections.map((_,i)=>[i,Math.max(0,Math.min(Number.isInteger(raw?.pages?.[i])?raw.pages[i]:0,Math.ceil(visible.length/pageSize)-1))]))
  const pair=[];for(const id of [...(Array.isArray(raw?.pair)?raw.pair:[]),...visible])if(visible.includes(id)&&!pair.includes(id)&&pair.length<2)pair.push(id)
  return {order,filters,pair,query,pageSize,pages,selected:visible.includes(raw?.selected)?raw.selected:null,tab:Number.isInteger(raw?.tab)&&raw.tab>=0&&raw.tab<view.sections.length?raw.tab:0}
 }
 const visibleIds=s=>s.order.filter(id=>searchText.get(id).includes(s.query.toLocaleLowerCase())&&view.filters.every(key=>!s.filters[key]||token(records.get(id)[key])===s.filters[key]))
 function reduce(raw,a){
  const s=normalize(raw)
  if(a?.type==='filter'&&view.filters.includes(a.key)){s.filters[a.key]=a.value;s.pages={};return normalize(s)}
  if(a?.type==='search'){s.query=String(a.query??'');s.pages={};return normalize(s)}
  if(a?.type==='pageSize'&&[10,20,50,100].includes(a.value)){s.pageSize=a.value;s.pages={};return normalize(s)}
  if(a?.type==='page'&&Number.isInteger(a.index)&&view.sections[a.index]?.kind==='records'&&(Number.isInteger(a.value)||[-1,1].includes(a.delta)))s.pages[a.index]=Number.isInteger(a.value)?a.value:s.pages[a.index]+a.delta
  if(a?.type==='select'&&visibleIds(s).includes(a.id))s.selected=s.selected===a.id?null:a.id
  if(a?.type==='tab'&&Number.isInteger(a.index)&&view.sections[a.index])s.tab=a.index
  if(a?.type==='compare'&&[0,1].includes(a.side)&&visibleIds(s).includes(a.id)){
   const other=s.pair[1-a.side];s.pair[a.side]=a.id;if(other===a.id)s.pair[1-a.side]=visibleIds(s).find(id=>id!==a.id)
  }
  if(a?.type==='move'&&view.reorder&&['up','down'].includes(a.dir)){
   const visible=visibleIds(s),i=visible.indexOf(a.id),j=i+(a.dir==='up'?-1:1)
   if(i>=0&&j>=0&&j<visible.length){const at=s.order.indexOf(a.id),to=s.order.indexOf(visible[j]);[s.order[at],s.order[to]]=[s.order[to],s.order[at]]}
  }
  return normalize(s)
 }
 const make=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el}
 const sectionNodes=[...root.querySelectorAll('[data-view-section]')]
 const rowMaps=sectionNodes.map(el=>new Map([...el.querySelectorAll('[data-record-id]')].map(row=>[row.dataset.recordId,row])))
 function render(raw,ctx){
  const s=normalize(raw),visible=visibleIds(s),selected=records.get(s.selected),disabled=ctx.readOnly||!ctx.connected
  root.querySelector('[data-view-count]').textContent=`显示 ${visible.length} / ${ids.length} 条记录`
  const search=root.querySelector('[data-view-search]');search.value=s.query;search.disabled=disabled
  for(const input of root.querySelectorAll('[data-view-filter]')){input.value=s.filters[input.dataset.viewFilter];input.disabled=disabled}
  root.querySelectorAll('[data-view-tab]').forEach(button=>{const active=Number(button.dataset.viewTab)===s.tab;button.setAttribute('aria-selected',String(active));button.disabled=disabled})
  view.sections.forEach((section,i)=>{
   const el=sectionNodes[i];el.hidden=view.navigation==='tabs'&&s.tab!==i
   if(section.kind==='records'||section.kind==='schedule'){
    const target=el.querySelector(section.kind==='records'?'tbody':'.dv-schedule-rows'),map=rowMaps[i]
    const pager=el.querySelector('.dv-pagination'),start=s.pages[i]*s.pageSize,shown=pager?visible.slice(start,start+s.pageSize):visible
    for(const id of s.order){const row=map.get(id);row.hidden=!shown.includes(id);row.setAttribute('aria-selected',String(id===s.selected));target.appendChild(row)
     const seq=row.querySelector('[data-view-rank]');if(seq)seq.textContent=String(s.order.indexOf(id)+1)
     row.querySelectorAll('[data-view-move]').forEach(button=>{const index=visible.indexOf(id);button.disabled=disabled||index<0||(button.dataset.viewMove==='up'?index===0:index===visible.length-1)})
     row.querySelectorAll('[data-view-select]').forEach(button=>{button.disabled=disabled;button.setAttribute('aria-pressed',String(id===s.selected))})
    }
    el.querySelector('[data-view-empty]').hidden=visible.length!==0
    if(pager){
     const total=Math.max(1,Math.ceil(visible.length/s.pageSize)),index=pager.querySelector('[data-view-page-index]'),size=pager.querySelector('[data-view-page-size]')
     pager.querySelector('[data-view-range]').textContent=(visible.length?start+1:0)+'–'+Math.min(start+s.pageSize,visible.length)+' / '+visible.length+' 条'
     size.value=String(s.pageSize);size.disabled=disabled
     index.replaceChildren(...Array.from({length:total},(_,page)=>{const option=make('option',(page+1)+' / '+total);option.value=String(page);return option}));index.value=String(s.pages[i]);index.disabled=disabled
     for(const button of pager.querySelectorAll('[data-view-page]'))button.disabled=disabled||(Number(button.dataset.pageDelta)<0?s.pages[i]===0:s.pages[i]>=total-1)
    }
   }else{
    const selects=el.querySelectorAll('[data-view-compare]')
    selects.forEach((select,side)=>{select.replaceChildren(...visible.map(id=>{const option=make('option',valueText(records.get(id).id));option.value=id;return option}));select.value=s.pair[side]??'';select.disabled=disabled||visible.length<2})
    const body=el.querySelector('.dv-compare-rows');body.replaceChildren()
    if(s.pair.length<2){body.appendChild(make('p','筛选后不足两条记录，请调整筛选条件。','dv-muted'))}
    else {
     const header=make('div',undefined,'dv-compare-row dv-compare-head');header.setAttribute('role','row')
     for(const label of ['对比字段',...s.pair]){const cell=make('div',label);cell.setAttribute('role','columnheader');header.appendChild(cell)}body.appendChild(header)
     for(const key of section.fields){const row=make('div',undefined,'dv-compare-row');row.setAttribute('role','row');const label=make('div',fields.get(key).label,'dv-compare-label');label.setAttribute('role','rowheader');row.appendChild(label);for(const id of s.pair){const cell=make('div',valueText(records.get(id)[key],fields.get(key)),'dv-compare-value');cell.setAttribute('role','cell');row.appendChild(cell)}body.appendChild(row)}
    }
   }
  })
  const detail=root.querySelector('.dv-detail')
  detail.hidden=!view.details.length||(view.navigation==='tabs'&&view.sections[s.tab].kind==='compare')
  detail.replaceChildren(make('h3',selected?`记录 ${selected.id}`:'点选记录查看详情'))
  if(selected){const dl=make('dl');for(const key of view.details){dl.appendChild(make('dt',fields.get(key).label));dl.appendChild(make('dd',valueText(selected[key],fields.get(key))))}detail.appendChild(dl)}
  else detail.appendChild(make('p','选择记录后显示完整字段和备注。','dv-muted'))
  window.dispatchEvent(new Event('sherlock-presentation-change'))
 }
 const shared=window.sherlockShared.register({initialState:normalize({}),reduce,render})
 root.addEventListener('change',e=>{
  const el=e.target
  if(el.matches('[data-view-filter]'))shared.dispatch({type:'filter',key:el.dataset.viewFilter,value:el.value})
  if(el.matches('[data-view-compare]'))shared.dispatch({type:'compare',side:Number(el.dataset.viewCompare),id:el.value})
  if(el.matches('[data-view-page-size]'))shared.dispatch({type:'pageSize',value:Number(el.value)})
  if(el.matches('[data-view-page-index]'))shared.dispatch({type:'page',index:Number(el.dataset.viewPageIndex),value:Number(el.value)})
 })
 root.addEventListener('input',e=>{if(e.target.matches('[data-view-search]'))shared.dispatch({type:'search',query:e.target.value})})
 root.addEventListener('click',e=>{
  const page=e.target.closest('[data-view-page]');if(page){const index=Number(page.dataset.viewPage);shared.dispatch({type:'page',index,delta:Number(page.dataset.pageDelta)});return}
  const move=e.target.closest('[data-view-move]');if(move){shared.dispatch({type:'move',id:move.dataset.id,dir:move.dataset.viewMove});return}
  const tab=e.target.closest('[data-view-tab]');if(tab){shared.dispatch({type:'tab',index:Number(tab.dataset.viewTab)});return}
  const row=e.target.closest('[data-record-id]');if(row)shared.dispatch({type:'select',id:row.dataset.recordId})
 })
 root.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||e.target.tagName!=='TR')return;e.preventDefault();shared.dispatch({type:'select',id:e.target.dataset.recordId})})
}
