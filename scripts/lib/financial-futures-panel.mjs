// Serialized into the trusted research client with the other native widgets.
export function FinancialFuturesPanel({report,initialProduct}){
 const {jsx,jsxs}=react_jsx_runtime
 const tabs=['期限结构','持仓分布','合约明细']
 const [chosen,setChosen]=react.useState(''),[tab,setTab]=react.useState(tabs[0])
 const tabsId=react.useId(),requested=(chosen||initialProduct||'').trim().toLowerCase()
 const product=requested?report.products.find(item=>item.code===requested||item.name===requested):report.products[0]
 const format=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:3}):'—'
 const contracts=product?.contracts??[],settled=contracts.filter(row=>Number.isFinite(row.settlement))
 const unit=product?.unit??'',heading=(label,value)=>jsxs('div',{children:[jsx('small',{children:label}),jsx('strong',{children:value})]})
 const table=()=>jsx('div',{className:'ew-futures-scroll',children:jsxs('table',{children:[
  jsx('thead',{children:jsx('tr',{children:['合约','结算价','收盘价','成交量（手）','持仓量（手）'].map(label=>jsx('th',{scope:'col',children:label},label))})}),
  jsx('tbody',{children:contracts.map(row=>jsxs('tr',{children:[jsx('th',{scope:'row',children:row.code}),...['settlement','close','volume','openInterest'].map(key=>jsx('td',{children:format(row[key])},key))]},row.code))})
 ]})})
 const positions=()=>{
  const rows=contracts.filter(row=>Number.isFinite(row.openInterest)).sort((a,b)=>b.openInterest-a.openInterest)
  const maximum=rows[0]?.openInterest
  return rows.length?jsx('ol',{className:'ew-futures-positions',children:rows.map(row=>jsxs('li',{children:[jsx('span',{children:row.code}),
   jsx('span',{className:'ew-futures-bar-track','aria-hidden':true,children:jsx('i',{style:{width:(maximum?row.openInterest/maximum*100:0)+'%'}})}),
   jsx('span',{children:format(row.openInterest)+' 手'})]},row.code))}):jsx('p',{role:'status',children:'交易日报未提供持仓量'})
 }
 const curve=()=>{
  if(settled.length<2)return jsx('p',{role:'status',children:'同一交易日的有效结算价不足两个，合约明细可查看已公布数据。'})
  const low=Math.min(...settled.map(row=>row.settlement)),high=Math.max(...settled.map(row=>row.settlement))
  const pad=(high-low)*.12||Math.abs(high)*.005||1,min=low-pad,max=high+pad
  const month=row=>Number(row.month.slice(0,2))*12+Number(row.month.slice(2))
  const first=month(contracts[0]),last=month(contracts.at(-1))
  const x=row=>16+(month(row)-first)/Math.max(1,last-first)*424
  const y=value=>18+(max-value)/(max-min)*106
  const axis=[max,(min+max)/2,min]
  const path=contracts.map((row,index)=>Number.isFinite(row.settlement)?(index&&Number.isFinite(contracts[index-1].settlement)?'L':'M')+x(row)+' '+y(row.settlement):'').join(' ')
  const stride=Math.max(1,Math.ceil(contracts.length/5))
  const labels=contracts.filter((row,i)=>!i||i===contracts.length-1||i%stride===0&&month(contracts.at(-1))-month(row)>=stride)
  return jsx('svg',{className:'ew-futures-curve',viewBox:'0 0 520 152',role:'img','aria-label':product.name+'各交割月结算价，单位'+(unit||'见交易日报')+'。各合约数值见合约明细。',children:[
   ...axis.map((v,i)=>jsxs('g',{children:[jsx('line',{x1:16,x2:440,y1:y(v),y2:y(v),stroke:'var(--fw-grid)'}),jsx('text',{x:450,y:y(v)+4,children:format(Math.round(v*100)/100)})]},'axis'+i)),
   jsx('path',{d:path,fill:'none',stroke:'var(--fw-ma-1)',strokeWidth:2.4,strokeLinejoin:'round'},'curve'),
   ...settled.map(row=>jsx('circle',{cx:x(row),cy:y(row.settlement),r:3.2,fill:'var(--fw-ma-1)',children:jsx('title',{children:row.code+' · '+format(row.settlement)+' '+unit})},row.code)),
   ...labels.map((row,i)=>jsx('text',{x:x(row),y:147,textAnchor:i===0?'start':i===labels.length-1?'end':'middle',children:row.month},'month'+row.month))
  ]})
 }
 const changeTab=(event,index)=>{
  const next={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1}[event.key]
  if(next===undefined)return
  event.preventDefault();event.stopPropagation();setTab(tabs[next]);event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus()
 }
 const first=settled[0],last=settled.at(-1)
 return jsxs('div',{className:'ew-futures-panel',children:[
  jsxs('div',{className:'ew-futures-heading',children:[
   jsx('select',{'aria-label':'选择期货品种',value:product?.code??'',onChange:event=>setChosen(event.target.value),children:[
    ...(!product?[jsx('option',{value:'',children:'选择日报覆盖的品种'},'empty')]:[]),
    ...report.products.map(item=>jsx('option',{value:item.code,children:item.name+' · '+item.code.toUpperCase()},item.code))]}),
   jsx('a',{href:report.url,onClick:financialOpenArticle,target:'_blank',rel:'noopener noreferrer',title:'打开该交易日的交易所原始报告',children:'交易日报 ↗'})]}),
  jsx('div',{role:'tablist','aria-label':'期货行情栏目',className:'ew-futures-tabs',children:tabs.map((name,i)=>jsx('button',{role:'tab',type:'button',id:tabsId+'-tab-'+i,'aria-controls':tabsId+'-panel','aria-selected':tab===name,tabIndex:tab===name?0:-1,onClick:()=>setTab(name),onKeyDown:event=>changeTab(event,i),children:name},name))}),
  jsx('div',{id:tabsId+'-panel',role:'tabpanel','aria-labelledby':tabsId+'-tab-'+tabs.indexOf(tab),className:'ew-futures-view',children:!product?jsx('p',{role:'status',children:'该交易日报没有所选品种，可切换查看其他在市合约。'}):tab==='合约明细'?table():tab==='持仓分布'?positions():jsxs(react.Fragment,{children:[
   jsxs('div',{className:'ew-futures-metrics',children:[heading('近月结算'+(first?' · '+first.code:''),format(first?.settlement)),heading('远月减近月'+(unit?'（'+unit+'）':''),first&&last!==first?format(last.settlement-first.settlement):'—')]}),curve()]})})
 ]})
}
