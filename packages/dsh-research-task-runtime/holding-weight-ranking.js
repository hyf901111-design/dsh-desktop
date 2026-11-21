// A holding's fair value and its weight have the same fund NAV denominator.
// A second ranking is unnecessary only when the requested weighting, evidence
// and already visible original amounts establish that relationship on this card.
export function requestsHoldingWeightRanking(userText){
 return /持仓|重仓/u.test(userText)&&/(?:净值占比|占(?:基金)?(?:资产)?净值(?:比例|比重)?|持仓权重)/u.test(userText)&&
  /排名|排序|名次|第一名|居首/u.test(userText)&&!/不(?:要|用|必|需)|无需/u.test(userText.match(/[^，。；;\n]{0,12}(?:权重|净值占比)(?:排名|排序)/u)?.[0]??'')
}

function singleHoldingWeightRanking(narrative) {
 const userText=narrative.split(/\r?\n/u).filter(line=>!/^\s*(?:https?:\/\/|(?:数据|资料)?(?:来源|出处)\s*[:：为])/iu.test(line)).join(' ')
 if(!requestsHoldingWeightRanking(userText))return false
 // An explicit count, additional comparison, amount or prescribed secondary
 // display is a choice by the author, even when its rankings coincide.
 return !/公允价值|金额|市值|估值|持仓额|绝对规模|绝对体量|双重|双视角|双口径|分别(?:排名|排序)|各(?:一|自)|每[项种列个].{0,8}(?:[一1]张|成图)|[\d零〇一二两三四五六七八九十百]+\s*(?:张|幅)|(?:[\d零〇一二两三四五六七八九十百]+|若干)\s*(?:张|个|幅|组|套)\s*(?:独立|不同|并列|研究|对照)?(?:图|表|卡|组件|面板)|全部(?:做成|画出|绘制)(?:图|排名)/u.test(userText)
}

function rankedField(panel,dataset,labelPattern){
 const spec=panel.artifact, section=panel.view?.sections?.[0]
 if(panel.type!=='chart'||!['horizontal','bar'].includes(spec?.variant)||spec.series?.length!==1||
    panel.view?.dataset!==dataset.id||panel.view.sections?.length!==1||section?.kind!=='records'||section.fields?.length!==1)return
 const key=section.fields[0],field=dataset.fields.find(f=>f.key===key),dimension=section.label
 if(!field||!labelPattern.test(field.label)||!dimension||spec.labels.length!==dataset.records.length||spec.labels.length<2)return
 const byLabel=new Map(dataset.records.map(row=>[row[dimension],row[key]]))
 if(byLabel.size!==spec.labels.length||new Set(spec.labels).size!==spec.labels.length)return
 const values=spec.series[0].values
 // Distinct, descending raw observations. Ties and different comparison scopes
 // can carry information in the second ranking and must remain available.
 if(!spec.labels.every((label,i)=>byLabel.has(label)&&Number.isFinite(values[i])&&values[i]>0&&
    values[i]===byLabel.get(label)&&(i===0||values[i-1]>values[i])))return
 return {key,labels:spec.labels}
}

function shareOneNAV(dataset,weight,value){
 const {minimumFractionDigits:digits,unit}=dataset.fields.find(f=>f.key===weight.key)
 if(unit!=='%'||!Number.isInteger(digits)||digits<0||digits>10)return false
 const scopes=dataset.fields.filter(f=>/基金(?:代码|名称)|组合(?:编号|代码|名称)|日期|币种|货币|\b(?:currency|portfolio|fund id|as.of)\b/iu.test(f.label))
 if(scopes.some(f=>new Set(dataset.records.map(r=>r[f.key])).size!==1))return false
 // Each rounded percentage implies an interval of possible net asset values.
 // No common interval means the absolute amounts answer a different question.
 const halfUnit=0.5*10**-digits
 let lower=0,upper=Infinity
 for(const row of dataset.records){
  const pct=row[weight.key],amount=row[value.key]
  if(pct<=halfUnit)return false
  lower=Math.max(lower,amount*100/(pct+halfUnit))
  upper=Math.min(upper,amount*100/(pct-halfUnit))
 }
 return lower<=upper
}

export function omitRedundantHoldingValueRanking(panels,datasets,narrative){
 if(!datasets?.length||!singleHoldingWeightRanking(narrative))return panels
 const skips=new Set()
 for(const dataset of datasets){
  const projected=panels.filter(p=>p.view?.dataset===dataset.id)
  const weights=projected.map(p=>rankedField(p,dataset,/占(?:基金)?(?:资产)?净值(?:比例|比重)|持仓权重/u)).filter(Boolean)
  if(weights.length!==1)continue
  const [weight]=weights
  for(const panel of projected){
   const value=rankedField(panel,dataset,/^(?:持仓)?公允价值(?:[（(][^()（）]+[）)])?$/u)
   if(!value||!value.labels.every((label,i)=>weight.labels[i]===label)||!shareOneNAV(dataset,weight,value))continue
   const detail=projected.some(p=>p.type==='view'&&!p.view.where?.length&&p.view.sections.some(s=>s.kind==='records'&&s.fields.includes(value.key)&&s.fields.includes(weight.key)))
   if(detail)skips.add(panel)
  }
 }
 return skips.size?panels.filter(p=>!skips.has(p)):panels
}
