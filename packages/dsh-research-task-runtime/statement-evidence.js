// Latest-report tasks do not need decades of ascending financial records in
// their synthesis prompt. Explicit historical/series requests keep every row.
export function latestStatementRequest(request='') {
 return /最新|最近(?:已披露|一期)|latest|most recent/iu.test(request)&&/财报|财务|定期报告|利润表|financial statements?|income statements?/iu.test(request)&&
  !/(?<!\d)(?:19|20)(?:\d{2}|\d{6})(?!\d)|历年|历史|逐年|逐季|各年|各期|趋势|走势|序列|去年|前年|近\s*\d+\s*(?:年|季)|histor|series|trend/iu.test(request)
}

export function compactStatementEvidence(data,request) {
 if(!latestStatementRequest(request)||data?.retCode!==1||!Array.isArray(data.data)||data.data.length<4||data.data.length>10000)return
 const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v
 const groups=new Map()
 for(const row of data.data){
  if(!row||typeof row!=='object'||Array.isArray(row)||!date(row.publishDate)||!date(row.endDateRep??row.endDate))return
  const id=row.secID??row.ticker
  if(typeof id!=='string'||!id.trim()||id.length>128)return
  if(!groups.has(id))groups.set(id,[])
  groups.get(id).push(row)
 }
 if(groups.size>12)return
 const rows=[]
 const needsComparison=/同比|上年同期|\byoy\b|year.over.year/iu.test(request)
 for(const group of groups.values()){
  const periods=[...new Set(group.map(row=>row.endDateRep??row.endDate))].sort().reverse().slice(0,2)
  const recent=group.filter(row=>periods.includes(row.endDateRep??row.endDate))
  const comparison=row=>needsComparison&&recent.some(current=>{
   const a=current.endDateRep??current.endDate,b=row.endDateRep??row.endDate
   if(Number(b.slice(0,4))!==Number(a.slice(0,4))-1)return false
   return current.reportType&&row.reportType?current.reportType===row.reportType:a.slice(4)===b.slice(4)
  })
  // Keep comparative-period rows and all returned columns, including provider
  // fields unknown to the renderer. Do not substitute a fixed metric template.
  rows.push(...group.filter(row=>periods.includes(row.endDateRep??row.endDate)||comparison(row)).sort((a,b)=>String(b.endDateRep??b.endDate).localeCompare(String(a.endDateRep??a.endDate))||b.publishDate.localeCompare(a.publishDate)))
 }
 if(rows.length===data.data.length)return
 return {...data,data:rows,evidenceSelection:{note:'仅向最终生成阶段提供本次响应中各证券最近两个报告期的完整记录和字段；同比任务同时保留已返回的上年同类型/同日期报告及报告附带的比较期记录，计算前仍须核对币种与合并口径。完整原始响应由宿主保留；这是本次响应内的选择，不证明来源已返回全部最新记录，不能据省略推断其他期间无数据。',receivedRows:data.data.length,selectedRows:rows.length}}
}

export function truncatedStatementEvidence(text,request) {
 if(!latestStatementRequest(request))return
 const at=text.lastIndexOf('\n\n(Omitted ')
 if(at<0||!/^\n\n\(Omitted \d+ bytes\. Full formatted result stored at: [^\r\n]{1,8192}\)\s*$/.test(text.slice(at)))return
 const prefix=text.slice(0,at)
 // The transport can splice a head and tail in the middle of JSON. Such a
 // fragment is not decodable business evidence, even if its footer is intact.
 if(!/^\s*\{\s*"retCode"\s*:\s*1\s*,/.test(prefix)||!prefix.slice(0,1024).includes('"data"')||!prefix.includes('"publishDate"')||!/(?:"endDateRep"|"endDate")\s*:/.test(prefix))return
 return '财务来源响应已被工具截断，不能把升序第一页当成完整最新财报资料；本段不提供未完整取得的历史数值或内部文件路径。应按已取得的实际报告期收窄日期范围，或使用当前接口定义支持的分页/字段筛选重新取数。其他来源的完整记录仍可使用，未取得的字段明确标注缺失。'
}
