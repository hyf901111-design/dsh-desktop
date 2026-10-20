// Recover only an explicit base-100 comparison with an unambiguous observed
// daily-price source for every series. Never infer a source from similar names.
export function observedMarketHistory(data,records,options={}) {
 if(data?.version!==1||data.type!=='market'||data.variant!=='trend'||!Array.isArray(data.labels)||data.labels.length<2||data.labels.length>366||!Array.isArray(data.series)||!data.series.length||data.series.length>16)return
 const explicit=[data.note,data.asOf,...data.series.map(s=>s?.name)].join(' ')
 if(!/归一化|(?:基期|基准)\s*(?:=|为|：|:)?\s*100|base\s*100/iu.test(explicit)||data.series.some(s=>!Array.isArray(s?.values)||s.values.length!==data.labels.length||s.values[0]!==100))return
 const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v
 const symbol=text=>typeof text==='string'?text.toUpperCase().match(/(?<![A-Z0-9])(\d{6}\.(?:SH|SZ|BJ))(?=$|[^A-Z0-9])/u)?.[1]:undefined
 const facts=[],fetched=new Set(),limitations=new Set(),series=[],returns=[]
 const signed=value=>(value>0?'+':'')+value.toFixed(2)
 let labels
 for(const item of data.series){
  const code=symbol(item.name)
  if(!code)return
  const candidates=new Map()
  for(const record of records??[]){
   const response=record?.response
   if(record?.tool!=='financial_query'||record.purpose!=='snapshot'||record.args?.intent!=='history'||record.args?.interval!=='1d'||!Array.isArray(record.args.symbols)||!record.args.symbols.some(s=>typeof s==='string'&&s.toUpperCase()===code)||response?.schema_version!=='financial-1'||!Array.isArray(response.records))continue
   const rows=response.records.filter(row=>row.metric==='收盘价'&&symbol(row.instrument)===code)
   const selected=[]
   for(const label of data.labels){
    const matching=rows.filter(row=>iso(row.as_of)&&(iso(label)?row.as_of===label:typeof label==='string'&&/^\d{2}-\d{2}$/u.test(label)&&row.as_of.slice(5)===label))
    if(matching.length!==1){selected.length=0;break}
    selected.push(matching[0])
   }
   if(selected.length!==data.labels.length||selected.some((r,i)=>typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<=0||typeof r.unit!=='string'||!r.unit.trim()||typeof r.price_basis!=='string'||!r.price_basis.trim()||i&&r.as_of<=selected[i-1].as_of)||new Set(selected.map(r=>r.unit)).size!==1||new Set(selected.map(r=>r.price_basis)).size!==1)continue
   const key=JSON.stringify(selected.map(r=>[r.as_of,r.value,r.unit,r.price_basis]))
   const candidate=candidates.get(key)??{rows:selected,responses:[]};candidate.responses.push(response);candidates.set(key,candidate)
  }
  if(candidates.size!==1)return
  const {rows,responses}=[...candidates.values()][0],dates=rows.map(r=>r.as_of)
  if(labels&&JSON.stringify(labels)!==JSON.stringify(dates))return
  labels=dates
  series.push({...item,values:rows.map(r=>Number((r.value/rows[0].value*100).toFixed(2)))})
  const change=(rows.at(-1).value/rows[0].value-1)*100
  returns.push({code,change})
  facts.push(`${code}：原始单位 ${rows[0].unit}，${rows[0].price_basis}；基期值 ${rows[0].value}，末值 ${rows.at(-1).value}；区间涨跌幅 ${signed(change)}%`)
  for(const response of responses){
   if(typeof response.received_at==='string'&&Number.isFinite(Date.parse(response.received_at)))fetched.add(response.received_at)
   for(const limitation of typeof response.limitations==='string'?[response.limitations]:response.limitations??[])if(typeof limitation==='string'&&limitation.trim())limitations.add(limitation)
   if(response.status==='partial')limitations.add(`${code} 来源响应为部分数据`)
  }
 }
 const benchmark=returns.find(r=>r.code===options.benchmarkSymbol)
 const ranking=benchmark?`相对 ${benchmark.code} 的区间涨跌幅差（百分点，由高到低）：${returns.filter(r=>r!==benchmark).sort((a,b)=>b.change-a.change).map(r=>`${r.code} ${signed(r.change-benchmark.change)}`).join('；')}。` : ''
 const note=[`来源：financial_query / financial-1。展示区间 ${labels[0]} 至 ${labels.at(-1)}，各序列 ${labels.length}个实际时点，日期逐项对齐。`,...facts,ranking,'宿主按各价格/各自首值×100计算；涨跌幅与涨跌幅差先由原始价格计算，最后保留两位小数。仅反映所选的已取得记录，不代表所请求区间的完整覆盖。',fetched.size?`获取时间（非报价时间）：${[...fetched].join('、')}`:'获取时间：来源未提供',...limitations].filter(Boolean).join('\n')
 if(note.length>2000)return
 const restored={...data,labels,series,asOf:`历史日线 · 数据截至 ${labels.at(-1)} · ${labels.length}个实际时点 · 基期100`,note}
 return JSON.stringify(restored)===JSON.stringify(data)?undefined:restored
}
