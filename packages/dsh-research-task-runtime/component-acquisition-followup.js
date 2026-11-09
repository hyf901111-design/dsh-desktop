// Observed continuations only: no guessed API, entity, credential or date.
// A nonempty first page is evidence, not a certificate of requested coverage.
export function componentAcquisitionFollowup(records=[],{unreadSourceUrls=[]}={}) {
 const pending=[];
 for(const record of records){
  const page=record.response?.pagination;
  if(record.purpose==='discovery'||!page?.possiblyMore||!Number.isSafeInteger(page.nextOffset)||page.nextOffset<0||!record.args||typeof record.tool!=='string')continue;
  pending.push({tool:record.tool,args:{...record.args,offset:page.nextOffset},returned:record.response?.records?.length??page.returned});
 }
 const notes=[];
 if(pending.length)notes.push('以下实际业务响应声明仍有分页（nextOffset）。先核对记录数、实体数和日期窗口是否覆盖本面板需求；不足时继续同一已成功查询的下一页，复用字段与范围，按已取得目录定义选择合适页大小。不能把首屏几行当成全年序列、全部目标或全市场。覆盖足够则停止，不能无目的取全库。尚未执行的后续请求：\n'+JSON.stringify(pending.slice(-8)));
 const business=records.some(record=>record.purpose!=='discovery'&&((record.response?.records?.length??0)>0||(record.snapshotRows?.length??0)>0));
 if(!business){
  const urls=[...new Set(unreadSourceUrls)].filter(value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&value.length<8192&&![...url.searchParams.keys()].some(key=>/token|secret|auth|password|api[_-]?key|credential/iu.test(key))}catch{return false}}).slice(0,5);
  if(urls.length)notes.push('当前只有检索摘要或接口目录，尚无已核实业务正文。使用本轮已授权的 web_fetch 读取这些已检索到的原始页面，核对实际内容、日期与单位后再呈现；不得直接抄检索摘要，也不要继续重复搜索同一问题。若用户限定来源，只读取符合原来源约束的页面：\n'+JSON.stringify(urls));
 }
 return notes.join('\n\n');
}
