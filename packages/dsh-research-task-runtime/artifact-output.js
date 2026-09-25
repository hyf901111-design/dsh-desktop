import { renderMarketArtifact } from './market-artifact.js';
import { parseResearchContainerSpec } from './artifact-validator.js';
import { renderInteractiveArtifact } from './interactive-artifact.js';
import { renderGanttArtifact } from './gantt-artifact.js';
import { researchHtmlText } from './html-artifact.js';

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
export function acceptArtifactOutput(text) {
 const candidates=extractArtifactObjects(text);
 for(const candidate of candidates.reverse()) {
  const missingChart=preserveMissingChartExplanation(candidate);
  if(missingChart)return JSON.stringify(missingChart);
  const chartWithNotes=preserveLongChartCaption(candidate);
  if(chartWithNotes)return JSON.stringify(chartWithNotes);
  const spec=parseResearchContainerSpec(renderMarketArtifact(detailedKpiMarket(candidate) ?? candidate) ?? renderInteractiveArtifact(candidate) ?? renderGanttArtifact(candidate) ?? candidate);
  if(!spec)continue;
  if(spec.type==='table' && !spec.rows.length)continue;
  // Require first-paint content; JS-only blank shells are repaired before publishing.
  if(spec.type==='html' && researchHtmlText(spec.html).length===0 && !/<(?:svg|canvas)\b/i.test(spec.html))continue;
  return JSON.stringify(spec);
 }
 return undefined;
}

export function workbenchMarketVariantIssue(output, prompt) {
 const expected=typeof prompt==='string'?prompt.match(/必须输出 market\.(fund-kpi|fund-holdings|fund-industry|metrics|candlestick|trend|scatter|table|pipeline|events|heatmap|breadth) 的结构化数据/iu)?.[1]:undefined;
 if(!expected||typeof output!=='string')return null;
 let spec;
 try{spec=JSON.parse(output)}catch{return null}
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

// A KPI item can carry source/date details even though the older native KPI
// schema only has change. Render that complete data with the trusted metrics
// template instead of discarding the panel or squeezing evidence into a value.
function detailedKpiMarket(candidate) {
 const scalar=value=>typeof value==='string'&&value.trim().length>0&&value.length<=512||typeof value==='number'&&Number.isFinite(value);
 if(candidate?.version!==1||candidate.type!=='kpi'||!Array.isArray(candidate.items)||
   Object.keys(candidate).some(key=>!['version','type','title','items'].includes(key))||
   !candidate.items.some(item=>typeof item?.detail==='string'&&item.detail.trim()))return null;
 if(candidate.items.some(item=>!item||Object.keys(item).some(key=>!['label','value','change','detail'].includes(key))||
   typeof item.label!=='string'||!item.label.trim()||!scalar(item.value)||item.change!==undefined&&!scalar(item.change)||
   item.detail!==undefined&&(typeof item.detail!=='string'||item.detail.length>2000)))return null;
 return {version:1,type:'market',variant:'metrics',title:candidate.title,asOf:'数据时点见各指标说明',
  items:candidate.items.map(item=>{const detail=[item.change,item.detail].filter(value=>value!==undefined&&value!==null&&String(value).trim()).map(String).join(' · ');
   return {label:item.label,value:String(item.value),...(detail?{detail}:{})}})};
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
  return (chart.variant==='line'?`<polyline points="${s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`:'')+marks;
 }).join('');
 const ticks=[0,1,2,3,4].map(i=>{const v=low+(high-low)*i/4;return `<line x1="55" x2="605" y1="${y(v)}" y2="${y(v)}" stroke="var(--sherlock-border)" stroke-dasharray="4 4"/><text x="48" y="${y(v)+4}" text-anchor="end">${esc(Number(v.toPrecision(5)))}</text>`}).join('');
 const dates=chart.labels.map((l,i)=>i===0||i===chart.labels.length-1||i%Math.max(1,Math.ceil(chart.labels.length/5))===0?`<text x="${x(i)}" y="283" text-anchor="middle">${esc(l)}</text>`:'').join('');
 const rows=chart.labels.map((l,i)=>`<tr><td>${esc(l)}</td>${chart.series.map(s=>`<td>${s.values[i]}</td>`).join('')}</tr>`).join('');
 const html=`<style>body{padding:20px;font:14px/1.6 var(--sherlock-font-sans)}figure{margin:0}svg{display:block;width:100%;height:auto;color:var(--sherlock-text)}svg text{fill:currentColor;font-size:10px}figcaption{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--sherlock-muted)}summary{cursor:pointer}.legend{display:flex;gap:16px;flex-wrap:wrap;margin:8px 0}</style><figure><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 305" role="img" aria-label="${esc(title)}">${ticks}${series}${dates}</svg><div class="legend">${chart.series.map((s,i)=>`<span style="color:var(--sherlock-chart-${i+1})">● ${esc(s.name)}</span>`).join('')}</div><figcaption>${esc(caption)}</figcaption></figure><details><summary>查看全部数据</summary><table><thead><tr><th>日期</th>${chart.series.map(s=>`<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></details>`;
 return parseResearchContainerSpec({version:1,type:'html',title,html})??undefined;
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
