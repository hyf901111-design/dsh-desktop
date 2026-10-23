import {decimal,formatDecimal} from './numbers.mjs'
import {chartKind,chartReferences,chartNeedsDetail,chartIsWide,chartTime} from './chart-contract.mjs'
const units={CNY:'亿元',ratio:'%',CNY_per_share:'元/股',shares:'股'}
const unitLabel=unit=>units[unit]??unit
function axisLabel(value,unit,compact=false){
 const scaled=unit==='CNY'?decimal(value).div('100000000'):unit==='ratio'?decimal(value).mul('100'):decimal(value)
 const text=scaled.toString(compact?0:2,true),sign=text.startsWith('-')?'-':'',whole=text.replace(/^-/,'').split('.')[0]
 return whole.length>10?sign+whole[0]+'.'+whole.slice(1,3)+'×10^'+(whole.length-1):text
}
function domain(values){
 let min=decimal('0'),max=decimal('0')
 for(const value of values){const v=decimal(value);if(v.cmp(min)<0)min=v;if(v.cmp(max)>0)max=v}
 if(min.cmp(max)===0)max=min.add('1')
 return{min,max}
}
function focusDomain(values){
 const raw=values.map(value=>decimal(value)),min=raw.reduce((a,v)=>v.cmp(a)<0?v:a),max=raw.reduce((a,v)=>v.cmp(a)>0?v:a),padding=max.sub(min).div('10')
 if(min.cmp('0')>0&&max.cmp(min)>0&&min.sub(padding).cmp('0')>0)return{min:min.sub(padding),max:max.add(padding),focused:true}
 if(max.cmp('0')<0&&max.cmp(min)>0&&max.add(padding).cmp('0')<0)return{min:min.sub(padding),max:max.add(padding),focused:true}
 return domain(values)
}
const position=(value,d,low,high)=>high-Number(decimal(value).sub(d.min).div(d.max.sub(d.min)).toString(12))*(high-low)
function axes(d,{x0,x1,top,bottom,unit,escape,right=false,grid=true,compact=false}){
 const x=right?x1:x0
 let html=`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#A7BAC6"/>`
 for(let i=0;i<=4;i++){const value=d.min.add(d.max.sub(d.min).mul(String(i)).div('4')),y=position(value,d,top,bottom)
  html+=`${grid?`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#E2EAF0"/>`:''}<text class="axis-tick${right?' axis-right':''}" x="${right?x+8:x-8}" y="${y+4}" text-anchor="${right?'start':'end'}">${escape(axisLabel(value,unit,compact)+(right&&unit==='ratio'?'%':''))}</text>`
 }
 const zero=position('0',d,top,bottom)
 if(d.min.cmp('0')<=0&&d.max.cmp('0')>=0)html+=`<line class="zero-line${right?' axis-right':''}" x1="${x0}" y1="${zero}" x2="${x1}" y2="${zero}" stroke="${right?'#1EB9E1':'#8EA7B5'}"${right?' stroke-dasharray="4 3"':''}/>`
 return html
}
function valueTable(chart,series,labels,ctx){
 const{escape:e,formatted,values,index,numberedTable,tokenValueFree,packet}=ctx
 return numberedTable(tokenValueFree(chart.title,packet,values)+' · 图示数据',['系列 / 单位',...labels],series.map(s=>'<tr><td>'+e(tokenValueFree(s.name,packet,values))+' / '+e(unitLabel(values.get(s.refs[0]).unit))+'</td>'+s.refs.map(id=>'<td class="number">'+e(formatted(values.get(id)))+'</td>').join('')+'</tr>'),index)
}
function waterfallSvg(chart,ctx){
 const{escape:e,formatted,values,packet,tokenValueFree,colors,index,numberedTable}=ctx,start=values.get(chart.startRef),end=values.get(chart.endRef),steps=chart.steps.map(s=>({...s,item:values.get(s.ref),label:tokenValueFree(s.label,packet,values)}))
 const columns=[{label:start.period+' 起点',value:decimal(start.value),from:decimal('0'),to:decimal(start.value),role:'total'}]
 let current=decimal(start.value)
 for(const s of steps){const next=current.add(s.item.value);columns.push({...s,value:decimal(s.item.value),from:current,to:next,role:'delta'});current=next}
 columns.push({label:end.period+' 终点',value:decimal(end.value),from:decimal('0'),to:decimal(end.value),role:'total'})
 const labelLines=text=>Array.from(text).reduce((rows,c,i)=>{if(i%9===0)rows.push('');rows[rows.length-1]+=c;return rows},[])
 const lineCount=Math.max(...columns.map(c=>labelLines(c.label).length)),width=760,top=28,bottom=220,x0=78,x1=730,group=(x1-x0)/columns.length,bar=Math.min(48,group*.68),d=domain(columns.flatMap(c=>[c.from.toString(),c.to.toString()]))
 let svg=axes(d,{x0,x1,top,bottom,unit:'CNY',escape:e})
 svg+=columns.map((c,i)=>{const x=x0+(i+.5)*group-bar/2,y1=position(c.from,d,top,bottom),y2=position(c.to,d,top,bottom),fill=c.role==='total'?colors[0]:c.value.cmp('0')>=0?colors[1]:colors[3]
  return`${i>0?`<line x1="${x0+(i-.5)*group+bar/2}" y1="${position(columns[i-1].to,d,top,bottom)}" x2="${x}" y2="${position(columns[i-1].to,d,top,bottom)}" stroke="#91A6B3" stroke-dasharray="3 2"/>`:''}<rect x="${x}" y="${Math.min(y1,y2)}" width="${bar}" height="${Math.abs(y1-y2)}" fill="${fill}"/><text x="${x+bar/2}" y="${Math.min(y1,y2)-7}" text-anchor="middle">${e((c.role==='delta'&&c.value.cmp('0')>0?'+':'')+axisLabel(c.value,'CNY'))}</text><text x="${x+bar/2}" y="${bottom+22}" text-anchor="middle">${labelLines(c.label).map((label,j)=>`<tspan x="${x+bar/2}" dy="${j?14:0}">${e(label)}</tspan>`).join('')}</text>`
 }).join('')
 const detail=numberedTable(tokenValueFree(chart.title,packet,values)+' · 图示数据',['算术项目','有符号金额','期间 / 范围'],columns.map(c=>`<tr><td>${e(c.label)}</td><td class="number">${e(formatted({value:c.value.toString(),unit:'CNY'}))}</td><td>${e(c.role==='total'?(c===columns[0]?start.period:end.period):c.item.period)} / ${e(start.scope)}</td></tr>`),index)
 return{svg:`<svg viewBox="0 0 ${width} ${bottom+35+lineCount*14}" role="img" aria-label="${e(tokenValueFree(chart.title,packet,values))}">${svg}</svg>`,detail,unit:'CNY',scope:start.scope,periods:[start.period,end.period],legend:'<span>深蓝：端点；青色：正向差额；黄色：负向差额</span>',note:'算术桥，不代表因果归因；符号与闭合关系来自确定性计算，未证明各项目的经济因果贡献。'}
}
export function renderResearchChart(chart,ctx){
 const{escape:e,formatted,values,packet,tokenValueFree,index,narrow=false,colors,sourceIds}=ctx,kind=chartKind(chart),name=tokenValueFree(chart.title,packet,values),figure=index.chart(name)
 if(kind==='waterfall'){
  const result=waterfallSvg(chart,ctx),sources=[...new Set(chartReferences(chart).flatMap(id=>sourceIds(id,values)))]
  return `<figure class="wide" id="${figure.id}" data-publication-kind="figure" data-chart-kind="waterfall"><figcaption>${e(figure.title)}<small>单位：亿元 · ${e(result.scope)} · ${e(result.periods.join(' → '))}</small></figcaption><div class="legend">${result.legend}</div>${result.svg}<p class="small">${e(result.note)}</p>${sourceFooter(sources,ctx)}${result.detail}</figure>`
 }
 const series=chart.series,negativeBars=chart.series.some(s=>(kind==='bar'||kind==='combo'&&s.type==='bar')&&s.refs.some(id=>decimal(values.get(id).value).cmp('0')<0)),first=values.get(series[0].refs[0]),labels=series[0].refs.map(id=>values.get(id).period),wide=!narrow&&chartIsWide(chart),width=narrow?280:wide?760:440,x0=narrow?62:64,x1=width-(kind==='combo'?70:18),top=narrow?25:30,bottom=narrow?125:210,group=(x1-x0)/labels.length,detail=!narrow&&chartNeedsDetail(chart)
 const leftSeries=kind==='combo'?series.filter(s=>s.type==='bar'):series,leftUnit=values.get(leftSeries[0].refs[0]).unit,left=(kind==='line'&&leftUnit==='ratio'?focusDomain:domain)(leftSeries.flatMap(s=>s.refs.map(id=>values.get(id).value))),rightSeries=kind==='combo'?series.find(s=>s.type==='line'):null,right=rightSeries?domain(rightSeries.refs.map(id=>values.get(id).value)):null
 const times=labels.map(chartTime),firstTime=times[0],lastTime=times.at(-1),xAt=i=>['line','combo'].includes(kind)?x0+group/2+(times[i]-firstTime)/(lastTime-firstTime)*(x1-x0-group):x0+(i+.5)*group
 let svg=axes(left,{x0,x1,top,bottom,unit:leftUnit,escape:e,grid:!narrow,compact:narrow})
 if(right)svg+=axes(right,{x0,x1,top,bottom,unit:'ratio',escape:e,right:true,grid:false})
 const colorAt=j=>(kind==='line'?[colors[1],colors[0],colors[2],colors[3]]:colors)[j%colors.length]
 let barIndex=0;const barCount=series.filter(s=>kind==='bar'||kind==='combo'&&s.type==='bar').length,barWidth=Math.min(narrow?36:42,(group-16)/Math.max(1,barCount))
 for(const [j,s]of series.entries()){
  const isLine=kind==='line'||kind==='combo'&&s.type==='line',d=kind==='combo'&&s.type==='line'?right:left,color=kind==='combo'&&s.type==='line'?colors[1]:colorAt(j),points=s.refs.map((id,i)=>({value:values.get(id),x:xAt(i),y:position(values.get(id).value,d,top,bottom)}))
  if(isLine){svg+=`<polyline points="${points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${color}" stroke-width="2.7"/>`+points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.8" fill="${color}" stroke="#fff" stroke-width="1.2"/>${!detail?`<text x="${p.x}" y="${p.y-9}" text-anchor="middle">${e(axisLabel(p.value.value,p.value.unit))}</text>`:''}`).join('')}
  else{const offset=(barIndex++-(barCount-1)/2)*barWidth;svg+=points.map(p=>{const zero=position('0',d,top,bottom),x=p.x+offset-barWidth/2;return`<rect x="${x}" y="${Math.min(p.y,zero)}" width="${barWidth-3}" height="${Math.abs(zero-p.y)}" fill="${color}"/>${!narrow&&!detail?`<text x="${x+(barWidth-3)/2}" y="${p.y<=zero?p.y-8:p.y+15}" text-anchor="middle">${e(axisLabel(p.value.value,p.value.unit))}</text>`:''}`}).join('')}
 }
 svg+=labels.map((label,i)=>`<text x="${xAt(i)}" y="${bottom+(negativeBars?45:25)}" text-anchor="middle">${e(label)}</text>`).join('')
 const legend=series.map((s,j)=>`<span style="border-left:9px solid ${kind==='combo'&&s.type==='line'?colors[1]:colorAt(j)}">${e(tokenValueFree(s.name,packet,values))}${kind==='combo'?(s.type==='line'?'（右轴）':'（左轴）'):''}</span>`).join(''),sources=[...new Set(chartReferences(chart).flatMap(id=>sourceIds(id,values)))],axisMeta=kind==='combo'?'左轴：亿元 · 右轴：同比%':'单位：'+unitLabel(first.unit)+(left.focused?' · 纵轴未从零起':'')
 return `<figure${wide?' class="wide"':''} id="${figure.id}" data-publication-kind="figure" data-chart-kind="${kind}"><figcaption>${e(figure.title)}<small>${e(axisMeta)} · ${e(first.scope)}${narrow?' · 可比年度':' · '+e(labels.join(' / '))}</small></figcaption><div class="legend">${legend}</div><svg viewBox="0 0 ${width} ${narrow?(negativeBars?195:170):negativeBars?285:255}" role="img" aria-label="${e(name)}">${svg}</svg>${sourceFooter(sources,ctx)}${detail?valueTable(chart,series,labels,ctx):''}</figure>`
}
function sourceFooter(sources,ctx){
 const{packet,escape:e,narrow}=ctx
 return `<div class="small source-note">来源：${sources.map(id=>`<a href="#source-${e(id)}" title="${e(packet.sources.find(s=>s.id===id)?.title??id)}">[${packet.sources.findIndex(s=>s.id===id)+1}]</a>`).join('、')}${narrow?'。历史实绩见下表及附录。':'。同口径期间；图示取值均保留在明细与证据台账。'}</div>`
}
