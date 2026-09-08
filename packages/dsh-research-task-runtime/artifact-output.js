import { parseResearchContainerSpec } from './artifact-validator.js';
import { renderInteractiveArtifact } from './interactive-artifact.js';
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
  const spec=parseResearchContainerSpec(renderInteractiveArtifact(candidate) ?? candidate);
  if(!spec)continue;
  if(spec.type==='table' && !spec.rows.length)continue;
  // Require first-paint content; JS-only blank shells are repaired before publishing.
  if(spec.type==='html' && researchHtmlText(spec.html).length===0 && !/<(?:svg|canvas)\b/i.test(spec.html))continue;
  return JSON.stringify(spec);
 }
 return undefined;
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
