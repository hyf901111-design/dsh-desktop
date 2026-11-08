import {fixedChartRuntime} from './fixed-chart-runtime.js'
import {generatedChartGeometry} from './generated-chart-geometry.js';
import {renderTimelineArtifact} from './timeline-artifact.js';
import {renderKpiArtifact} from './kpi-artifact.js';
import {renderNoteArtifact} from './note-artifact.js';
import {renderRssArtifact} from './rss-artifact.js';
import {renderClockArtifact} from './clock-artifact.js';
import {renderInputArtifact} from './input-artifact.js';
import {renderAdvancedChart} from './advanced-chart-artifact.js';
import {renderSpecialChart} from './special-chart-artifact.js';
import { renderCartesianChart } from './cartesian-chart-artifact.js';
import { normalizeIndexedTableRows, templateDataIssue } from './template-data-contract.js';
import { CHART_VARIANTS, chartDataIssue, normalizeChartMetadata } from './chart-template-contract.js';
import {retainTemplateModel,readTemplateModel} from './component-template-registry.js';
import { renderMarketArtifact } from './market-artifact.js';
import { requiredMarketVariant } from './workbench-design-contract.js';
import { parseResearchContainerSpec } from './artifact-validator.js';
import { renderInteractiveArtifact } from './interactive-artifact.js';
import {renderWorkflowArtifact} from './workflow-artifact.js';
import {renderOperationsArtifact} from './operations-artifact.js';
import { renderGanttArtifact } from './gantt-artifact.js';
import {renderDatasetViewArtifact} from './dataset-view-artifact.js';
import { researchHtmlText } from './html-artifact.js';
import { chinaMarketWindow } from './component-source-tools.js';
import { financialWidgetDefaults } from './financial-widget-contract.js';
import {normalizeKeyedTableProjection} from './table-projection.js';
import {derivedOutline} from './derived-template-contract.js';

// Linear scan, string/escape aware: prose around a complete JSON object is harmless.
// Never eval model output, concatenate fragments, or guess missing values.
export function extractArtifactObjects(text) {
 const result=[];let start=-1,depth=0,quoted=false,escaped=false;
 for(let i=0;i<text.length;i++) {
  const c=text[i];
  if(start<0){if(c==='{'){start=i;depth=1}continue}
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
  if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{result.push(JSON.parse(text.slice(start,i+1)))}catch{}start=-1;if(result.length>=20)break}
 }
 return result;
}
// Recover only sentence quotes inside string values of one complete artifact.
// No keys, commas, braces, numbers or missing fields are repaired. Ambiguous
// closing quotes still fail JSON.parse and follow the normal recovery path.
export function restoreArtifactStringQuotes(text) {
 if(typeof text!=='string'||text.length>262144)return;
 const input=text.trim();if(!input.startsWith('{')||!input.endsWith('}'))return;
 try{JSON.parse(input);return}catch{}
 let quoted=false,key=false,escaped=false,previous='',changed=false,result='';const stack=[];
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){
   if(escaped)escaped=false;
   else if(c==='\\')escaped=true;
   else if(c==='"'){
    let next=i+1;while(next<input.length&&/\s/u.test(input[next]))next++;
    if(!key&&/[\p{L}\p{N}]/u.test(input[next]??'')){result+='\\';changed=true}
    else{quoted=false;previous='"'}
   }
  }else{
   if(c==='"'){quoted=true;key=previous!==':'&&previous!=='['&&!(previous===','&&stack.at(-1)==='[')}
   else if(c==='{'||c==='[')stack.push(c);
   else if(c==='}'||c===']')stack.pop();
   if(!/\s/u.test(c))previous=c;
  }
  result+=c;
 }
 if(!changed)return;
 try{
  const data=JSON.parse(result);if(data.version!==1||typeof data.type!=='string')return;
  const accepted=acceptArtifactOutput(result);if(!accepted)return;
  const spec=JSON.parse(accepted),model=readTemplateModel(spec)?.data??spec;
  if(model.type!==data.type&&!(data.type==='table'&&model.type==='market'&&model.variant==='table'))return;
  return result;
 }catch{}
}
// A planned panel already has a declared renderer. Recover only an omitted
// discriminator on one complete, valid object; business values stay untouched.
// Keep the data object so acquisition and per-record provenance still run.
export function restoreDeclaredArtifactType(text,type) {
 if(typeof type!=='string'||!/^[a-z][a-z-]{0,39}$/u.test(type))return;
 const candidates=extractArtifactObjects(text),data=candidates.length===1?candidates[0]:null;
 if(!data||data.version!==1||Object.hasOwn(data,'type'))return;
 const typed={...data,type},encoded=JSON.stringify(typed);
 let accepted;
 try{accepted=acceptArtifactOutput(encoded)}catch{return}
 if(!accepted)return;
 const spec=JSON.parse(accepted),model=readTemplateModel(spec)?.data??spec;
 if(model.type!==type&&!(type==='table'&&model.type==='market'&&model.variant==='table'))return;
 return encoded;
}
// The host's exact template contract can supply an omitted discriminator only.
// Never infer one from model data, replace an explicit value, or repair data.
export function restoreDeclaredChartVariant(text,contract) {
 if(contract?.version!==1||contract.type!=='chart'||!CHART_VARIANTS.includes(contract.variant))return;
 const candidates=extractArtifactObjects(text),data=candidates.length===1?candidates[0]:null;
 if(!data||data.version!==1||data.type!=='chart'||Object.hasOwn(data,'variant'))return;
 const declared={...data,variant:contract.variant};
 if(chartDataIssue(declared))return;
 const encoded=JSON.stringify(declared);
 let accepted;try{accepted=acceptArtifactOutput(encoded)}catch{return}
 if(!accepted)return;
 const spec=JSON.parse(accepted),model=readTemplateModel(spec)?.data??spec;
 if(model.type!=='chart'||model.variant!==contract.variant)return;
 return encoded;
}
export function retainedTableData(spec) {
 const data=spec?.type==='html'?readTemplateModel(spec)?.data:undefined;
 return data?.type==='table'||data?.type==='market'&&data.variant==='table'?data:undefined;
}
export function acceptArtifactOutput(text,{normalizeChartGeometry=true}={}) {
 const candidates=extractArtifactObjects(text);
 for(const original of candidates.reverse()) {
  // Retained JSON is data, not proof that model-supplied HTML displays it.
  // Rebuild tables with the same trusted renderer used for structured output.
  const tableData=retainedTableData(original)??original;
  let candidate=normalizeChartMetadata(normalizeTemplateAliases(normalizeIndexedTableRows(tableData)));
  if(normalizeChartGeometry&&candidate?.type==='html'&&typeof candidate.html==='string'){const projected=generatedChartGeometry(candidate.html);if(projected.html!==candidate.html)candidate={...candidate,html:projected.html};}
  const missingChart=preserveMissingChartExplanation(candidate);
  if(missingChart)return JSON.stringify(missingChart);
  const chartWithNotes=renderAdvancedChart(candidate) ?? renderSpecialChart(candidate) ?? renderCartesianChart(candidate) ?? preserveLongChartCaption(candidate);
  if(chartWithNotes){
   const parsed=parseResearchContainerSpec(chartWithNotes);
   if(parsed)return JSON.stringify(retainTemplateModel(parsed,candidate));
   continue;
  }
  const spec=parseResearchContainerSpec(renderDatasetViewArtifact(candidate) ?? renderTimelineArtifact(candidate) ?? renderKpiArtifact(candidate) ?? renderRssArtifact(candidate) ?? renderNoteArtifact(candidate) ?? renderClockArtifact(candidate) ?? renderInputArtifact(candidate) ?? renderWorkflowArtifact(candidate) ?? renderOperationsArtifact(candidate) ?? renderMarketArtifact(candidate) ?? renderInteractiveArtifact(candidate) ?? renderGanttArtifact(candidate) ?? candidate);
  if(!spec)continue;
  if(spec.type==='table' && !spec.rows.length)continue;
  // Require first-paint content; JS-only blank shells are repaired before publishing.
  if(spec.type==='html' && /^(?:\s|[.…⋯])*$/.test(researchHtmlText(spec.html)) && !/<(?:svg|canvas)\b/i.test(spec.html))continue;
  const retained=retainTemplateModel(spec,candidate);
  if(candidate.type==='view'&&!parseResearchContainerSpec(retained))continue;
  return JSON.stringify(retained);
 }
 return undefined;
}

// Preserve operational facts when the model spells state or note metadata
// differently from the native schema. Keep all other fields for validation.
export function normalizeOperationMetadata(value) {
 if (value?.type === 'tasks' && Array.isArray(value.items)) {
  const completion = new Map([['todo',false],['pending',false],['in_progress',false],['done',true],['completed',true]]);
  value = {...value, items:value.items.map(item => item && typeof item === 'object' &&
   item.completed === undefined && completion.has(item.status) ? {...item, completed:completion.get(item.status)} : item)};
 }
 if (value?.type === 'note' && typeof value.asOf === 'string' && value.asOf.trim() &&
   typeof value.note === 'string' && value.note.trim() && value.asOf.length + value.note.length + 1 <= 2000) {
  const {note, ...fields} = value;
  return {...fields, asOf:fields.asOf+'\n'+note};
 }
 return value;
}

// Accept the two common table shapes without asking a model to retranscribe
// values. Only explicit unique column keys may determine the cell order.
function normalizeTemplateAliases(value) {
 value=normalizeOperationMetadata(value);
 // HTML's envelope is deliberately small. Preserve common source metadata in
 // inert, host-readable markup instead of rejecting an otherwise complete
 // visualization and asking the model to rewrite all of its code.
 if(value?.type==='html'&&typeof value.html==='string'&&
  Object.keys(value).every(key=>['version','type','title','html','asOf','note','sources'].includes(key))&&
  [value.asOf,value.note].every(text=>text===undefined||typeof text==='string'&&text.trim()&&text.length<=8000)&&
  (value.sources===undefined||Array.isArray(value.sources)&&value.sources.length<=100&&value.sources.every(row=>row&&typeof row==='object'&&Object.keys(row).every(key=>['label','name','title','url','text'].includes(key))&&Object.values(row).every(text=>typeof text==='string'&&text.length<=8000)))&&
  ['asOf','note','sources'].some(key=>value[key]!==undefined)){
  const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows=[value.asOf,value.note].filter(Boolean).map(text=>'<p>'+esc(text)+'</p>');
  for(const row of value.sources??[]){
   const label=row.label||row.name||row.title||row.url||'来源';let link=false;
   try{const u=new URL(row.url);link=['http:','https:'].includes(u.protocol)&&!u.username&&!u.password}catch{}
   rows.push('<p>'+(link?'<a href="'+esc(row.url)+'">'+esc(label)+'</a>':esc([label,row.url].filter(Boolean).join('\n')))+(row.text?'\n'+esc(row.text):'')+'</p>');
  }
  const metadata='<aside hidden data-component-source-info>'+rows.join('')+'</aside>';
  const html=/<\/body\s*>/iu.test(value.html)?value.html.replace(/<\/body\s*>/iu,metadata+'$&'):value.html+metadata;
  value={version:value.version,type:value.type,title:value.title,html};
 }
 // Markdown with an explicit frozen source is the existing sourced-summary
 // contract. Keep its complete content and metadata instead of spending a
 // repair turn asking the model to remove provenance or retype business data.
 if(value?.type==='markdown'&&value.source){
  const sourced={...value,type:'summary'};
  if(parseResearchContainerSpec(sourced))value=sourced;
 }
 if(value?.type==='summary'&&typeof value.content==='string'&&value.source&&typeof value.source.text==='string'){
  const moved=[];
  const content=value.content.replace(/^#{1,6}\s+(?:(?:[一二三四五六七八九十百]+|[0-9]+)[、.．]\s*)?(?:主要资料来源|资料来源|参考来源|数据来源|口径与来源)\s*\n[\s\S]*?(?=^#{1,6}\s|$(?![\s\S]))/gmu,section=>{moved.push(section);return ''}).trim();
  if(moved.length&&content){
   const sourced={...value,content,source:{...value.source,text:[value.source.text,...moved].join('\n\n')}};
   if(parseResearchContainerSpec(sourced))value=sourced;
  }
 }

 // Panel geometry belongs to the workbench, even if an otherwise complete
 // artifact repeats the planned size. Keep other layout shapes for validation.
 const layout=value?.layout;
 if(layout&&Object.keys(layout).length===2&&Number.isFinite(layout.width)&&layout.width>0&&Number.isFinite(layout.height)&&layout.height>0){
  const {layout:_,...data}=value;
  value=data;
 }
 if(['mind-map','summary'].includes(value?.type)&&value.source&&value.note===undefined&&typeof value.notes==='string'){
  const {notes,...data}=value;
  value={...data,note:notes};
 }
 if(value?.type==='financial-widget'){
  const defaults=financialWidgetDefaults(value.widget);
  return defaults?{...defaults,...value}:value;
 }
 if(value?.type==='mind-map'&&(value.asOf!==undefined||value.note!==undefined)&&
   Object.keys(value).every(key=>['version','type','title','content','asOf','note'].includes(key))&&
   [value.asOf,value.note].every(text=>text===undefined||typeof text==='string'&&text.trim()&&text.length<=2000)&&derivedOutline(value.content)) {
  const {asOf,note,...outline}=value;
  return {...outline,source:{title:'来源与说明',text:[asOf,note].filter(Boolean).join('\n\n')}};
 }
 const keyed=normalizeKeyedTableProjection(value).data;
 if(keyed!==value)value={...keyed,rows:keyed.rows.map(row=>row.map(cell=>cell===null?'—':cell))};
 // Explicitly empty cells display as missing. Keep the row, including all
 // nonempty values, and do not fill absent column keys or nested values.
 if(value?.type==='table'&&Array.isArray(value.rows)&&value.rows.every(Array.isArray)) {
  const blank=cell=>cell===null||typeof cell==='string'&&!cell.trim();
  value={...value,rows:value.rows.map(row=>row.some(cell=>!blank(cell))?row.map(cell=>blank(cell)?'—':cell):row)};
 }
 // Native tables cannot carry provenance. Route a fully valid sourced table
 // to the trusted interactive template instead of retrying or losing its notes.
 // A note-only snapshot must keep its actual dates/sources in the note/rows;
 // the host supplies only a status label, never an inferred observation date.
 if(value?.type==='table'&&(typeof value.asOf==='string'&&value.asOf.trim()||value.asOf===undefined&&(typeof value.note==='string'&&value.note.trim()||Array.isArray(value.sources)&&value.sources.length))&&
   Object.keys(value).every(key=>['version','type','title','columns','rows','asOf','note','sources'].includes(key))&&
   (value.note===undefined||typeof value.note==='string'&&value.note.trim())) {
  if(!templateDataIssue(value))return {...value,type:'market',variant:'table',asOf:value.asOf??'静态快照 · 来源与时点见表格及说明'};
 }
 if(value?.type!=='market')return value;
 if(value.variant==='metrics'&&Array.isArray(value.items))return {...value,items:value.items.map(item=>
  item&&typeof item.change==='string'&&!item.detail?{...item,detail:item.change}:item)};
 return value;
}

export function workbenchMarketRecencyIssue(text, prompt, now = new Date()) {
 // The appended display contract mentions realtime data for every panel.
 // Only the actual panel request can require a recent daily market quote.
 const request=(prompt??'').split('仅生成本面板，')[0];
 if(!/(?:最近|最新|今日|当前|实时)/u.test(request)||!/(?:行情|收盘|指数|股价|股票|ETF)/iu.test(request)||/(?:情景模拟|模拟数据)/u.test(request))return null;
 if(/月度|季度|年度|季报|年报|产量|利润|营收|20\d{2}Q[1-4]/iu.test(request)&&!/(?:交易日|日行情|收盘|股价|股票行情|实时行情|最新行情)/u.test(request))return null;
 const candidate=extractArtifactObjects(text).reverse().find(value=>value?.type==='market'&&['metrics','trend'].includes(value.variant));
 if(!candidate)return null;
 const asOf=typeof candidate.asOf==='string'?candidate.asOf:'';
 const note=typeof candidate.note==='string'?candidate.note:'';
 const dates=[...asOf.matchAll(/(20\d{2})[-/.]?(\d{1,2})[-/.]?(\d{1,2})/gu)];
 const match=dates.at(-1);
 if(!match)return '最近行情面板必须标明确切数据日期，不得仅写“最新”或“最近可得”。';
 const date=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));
 if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`)return '行情指标的数据日期无效，请核对来源返回的交易日期。';
 const {start,end}=chinaMarketWindow(now);
 const today=Date.UTC(Number(end.slice(0,4)),Number(end.slice(4,6))-1,Number(end.slice(6,8)));
 const age=Math.round((today-date)/86400000);
 if(age>14&&!/(?:历史|过期|近期数据缺失|近期未返回|较早)/u.test(asOf+' '+note))return `本面板要求最近行情，但 ${asOf} 距中国市场日期 ${end} 已有 ${age} 天。先实际查询 ${start} 至 ${end} 的日期窗口；不能把旧年份或升序第一页写成“最近可得”。若来源确实没有近期数据，明确标注为历史数据及缺失范围。`;
 if(age < -1)return `行情数据日期 ${asOf} 晚于中国市场日期 ${end}，请核对来源交易日期。`;
 return null;
}

export function workbenchMarketVariantIssue(output, prompt) {
 if(typeof output!=='string')return null;
 let spec;
 try{spec=JSON.parse(output)}catch{return null}
 const expectedChart=prompt?.match(/必须输出 chart\.([a-zA-Z]+) 的结构化数据/u)?.[1];
 const chart=spec?.type==='chart'?spec:readTemplateModel(spec)?.data;
 if(expectedChart&&chart?.type==='chart'&&chart.variant!==expectedChart)return `本面板必须使用 chart.${expectedChart} 宿主模板，当前输出为 chart.${chart.variant}。保留指定图表的数据含义，不得降级为其他变体。`;
 const expected=requiredMarketVariant(prompt);
 if(!expected)return null;
 const actual=spec?.type==='html'?spec.html?.match(/<body\b[^>]*data-sherlock-market="([a-z-]+)"/iu)?.[1]:undefined;
 if(actual&&actual!==expected)return `本面板必须使用 market.${expected} 宿主模板，当前输出为 market.${actual}。请按原需求填充指定模板，不将主要数据放入 note。`;
 const symbols=[...new Set((prompt.match(/\b\d{6}\.(?:SH|SZ|BJ)\b/giu)??[]).map(value=>value.toUpperCase()))];
 if(actual==='candlestick'&&symbols.length>1){
  const options=[...spec.html.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/giu)].map(match=>match[1].toUpperCase());
  if(symbols.some(symbol=>!options.some(option=>option.includes(symbol))))return '需求包含多标的 K 线，必须用 datasets 保留各标的并提供切换；缺失标的须以明确的缺失状态说明，不能仅放在 note。';
 }
 if(actual==='table'&&symbols.length>1){
  const rows=spec.html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu)?.[1]?.toUpperCase()??'';
  if(symbols.some(symbol=>!rows.includes(symbol)))return '多标的行情表必须在表格行中保留所请求的证券代码；缺失标的须明确说明，不能只写在 note。';
 }
 return null;
}

// A source outage is useful research context, but an empty plot is neither a
// chart nor a generation error. Show the model's explicit missing-data account
// in the normal card renderer without inventing a point or dropping provenance.
function preserveMissingChartExplanation(candidate) {
 if(candidate?.type!=='chart'||typeof candidate.title!=='string'||!candidate.title.trim()||candidate.title.length>256)return;
 if(!Array.isArray(candidate.labels)||candidate.labels.length!==0||!Array.isArray(candidate.series)||!candidate.series.length)return;
 if(!candidate.series.every(series=>Array.isArray(series?.values)&&series.values.length===0))return;
 const missing=typeof candidate.missing==='string'?candidate.missing.trim():'';
 if(!/(?:缺失|不可用|未能取得|无法取得|未获取|no data|unavailable)/iu.test(missing))return;
 const lines=['**数据暂不可用**',missing];
 for(const [key,label] of [['basis','计算口径'],['source','资料来源'],['dataDate','数据时点'],['detail','待补内容']]) {
  const value=candidate[key];
  if(typeof value==='string'&&value.trim())lines.push(`**${label}**：${value.trim().slice(0,2000)}`);
 }
 return parseResearchContainerSpec({version:1,type:'markdown',title:candidate.title,content:lines.join('\n\n').slice(0,32000)})??undefined;
}

// The native chart schema has a short title but no description field. Preserve
// an otherwise valid chart whose model put source/date notes into that title as
// an offline figure, rather than discard its data or silently truncate the notes.
function preserveLongChartCaption(candidate) {
 if(candidate?.type!=='chart'||typeof candidate.title!=='string'||candidate.title.length>8000)return;
 const notes=[['dataDate','数据时点'],['asOf','数据时点'],['unit','单位'],['basis','计算口径'],['reading','解读口径'],['source','资料来源'],['detail','说明']]
  .flatMap(([key,label])=>typeof candidate[key]==='string'&&candidate[key].trim()? [`${label}：${candidate[key].trim().slice(0,2000)}`]:[]);

 if(candidate.title.length<=256&&!notes.length)return;
 const title=(candidate.title.split(/[｜|\n]/u)[0].trim()||'研究图表').slice(0,96);
 const chart=parseResearchContainerSpec({version:1,type:'chart',title,variant:candidate.variant,labels:candidate.labels,series:candidate.series});
 if(!chart)return;
 const caption=[candidate.title,...notes].join('\n');
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const values=chart.series.flatMap(s=>s.values),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
 const low=chart.variant==='bar'?Math.min(0,min):min-range*.08;
 const high=chart.variant==='bar'?Math.max(0,max):max+range*.08;
 const y=v=>260-(v-low)/(high-low||1)*220;
 const step=540/Math.max(1,chart.labels.length),x=i=>55+step*(i+.5);
 const series=chart.series.map((s,si)=>{
  const color=`var(--sherlock-chart-${si+1})`;
  const marks=s.values.map((v,i)=>{
   const hint=`<title>${esc(chart.labels[i])} · ${esc(s.name)}：${v}</title>`;
   if(chart.variant==='line')return `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${color}">${hint}</circle>`;
   const width=step*.75/chart.series.length;
   return `<rect x="${x(i)-step*.375+si*width}" y="${Math.min(y(v),y(0))}" width="${Math.max(.5,width-2)}" height="${Math.max(.5,Math.abs(y(v)-y(0)))}" fill="${color}">${hint}</rect>`;
  }).join('');
  return `<g data-series-group="${si}">`+(chart.variant==='line'?`<polyline points="${s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`:'')+marks+'</g>';
 }).join('');
 const ticks=[0,1,2,3,4].map(i=>{const v=low+(high-low)*i/4;return `<line x1="55" x2="605" y1="${y(v)}" y2="${y(v)}" stroke="var(--sherlock-border)" stroke-dasharray="4 4"/><text x="48" y="${y(v)+4}" text-anchor="end">${esc(Number(v.toPrecision(5)))}</text>`}).join('');
 const dates=chart.labels.map((l,i)=>i===0||i===chart.labels.length-1||i%Math.max(1,Math.ceil(chart.labels.length/5))===0?`<text x="${x(i)}" y="283" text-anchor="middle">${esc(l)}</text>`:'').join('');
 const rows=chart.labels.map((l,i)=>`<tr><td>${esc(l)}</td>${chart.series.map(s=>`<td>${s.values[i]}</td>`).join('')}</tr>`).join('');
 const html=`<style>body{margin:0;padding:8px 10px;font:11px/1.5 var(--sherlock-font-sans)}figure{margin:0}svg{display:block;width:100%;height:auto;color:var(--sherlock-text)}svg text{fill:currentColor;font-size:10px}figcaption{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--sherlock-muted)}summary{cursor:pointer}.legend{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0}.legend button{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer}.legend button[aria-pressed="false"]{opacity:.4}.chart-readout{min-height:18px;font-variant-numeric:tabular-nums}.chart-cursor{stroke:var(--sherlock-muted);stroke-dasharray:3 3}</style><figure><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 305" role="img" tabindex="0" aria-label="${esc(title)}；方向键切换数据点">${ticks}${series}${dates}<line class="chart-cursor" x1="${x(0)}" x2="${x(0)}" y1="40" y2="260"/></svg><div class="chart-readout" role="status"></div><div class="legend">${chart.series.map((s,i)=>`<button type="button" data-chart-series="${i}" aria-pressed="true" style="color:var(--sherlock-chart-${i+1})">● ${esc(s.name)}</button>`).join('')}</div><figcaption>${esc(caption)}</figcaption></figure><details><summary>查看全部数据</summary><table><thead><tr><th>日期</th>${chart.series.map(s=>`<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></details>`;
 const script='<script>('+fixedChartRuntime.toString()+')('+JSON.stringify(chart).replace(/</g,'\\u003c')+');</script>';
 return parseResearchContainerSpec({version:1,type:'html',title,html:html+script})??undefined;
}



// Recovery preserves only actual delivered content, never reasoning, prompts, or fabricated data.
export function artifactReadableFallback(text) {
 for(const value of extractArtifactObjects(text).reverse()) {
  const title=typeof value.title==='string'&&value.title.trim()?value.title.slice(0,256):'已取得的研究内容';
  let content;
  if(value.type==='html' && typeof value.html==='string')content=researchHtmlText(value.html);
  else if(['markdown','mind-map'].includes(value.type)&&typeof value.content==='string')content=value.content;
  else if(value.type==='table'&&Array.isArray(value.columns)&&Array.isArray(value.rows)) {
   content=value.rows.filter(r=>Array.isArray(r)&&r.length===value.columns.length&&r.every(c=>['string','number'].includes(typeof c))).map(r=>r.map((c,i)=>`${String(value.columns[i]).slice(0,128)}：${String(c)}`).join('\n\n')).join('\n\n---\n\n');
  }
  if(content?.trim().length>=20)return JSON.stringify({version:1,type:'markdown',title,content:('> 已保留可读内容，交互视图暂未完成。\n\n'+content).slice(0,32000)});
 }
 return undefined;
}
