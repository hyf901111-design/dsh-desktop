import {WORKFLOW_TEMPLATES,workflowDataIssue} from './workflow-template-contract.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText={pending:'待审核',approved:'已通过',rejected:'已退回'};
function workflowRuntime(type,local){
 const find=id=>document.getElementById(id);
 if(type==='approval'){
  if(!local)return;
  const output=find('personal-review'),reason=find('review-reason');
  for(const button of document.querySelectorAll('[data-review-decision]'))button.addEventListener('click',()=>{
   const comment=reason.value.trim();
   if(comment.length>2000||button.dataset.reviewDecision==='rejected'&&!comment){find('workflow-error').textContent='退回意见不能为空，最多2000字';return;}
   find('workflow-error').textContent='';
   output.textContent='个人审阅记录：'+(button.dataset.reviewDecision==='approved'?'同意':'退回修改')+(comment?' · '+comment:'');
   output.hidden=false;
  });
 }else{
  const rows=[...document.querySelectorAll('.alert-entry')],category=find('alert-category'),filter=find('alert-filter');
  function refresh(){
   let unread=0,shown=0;
   for(const row of rows){const read=row.querySelector('input').checked;if(!read)unread++;row.dataset.read=String(read);row.hidden=Boolean(category.value&&category.value!==row.dataset.category||filter.value==='unread'&&read);if(!row.hidden)shown++;}
   find('alert-count').textContent=unread+' 条未读 · '+rows.length+' 条';
   find('alert-empty').hidden=shown>0;
   if(local)find('alerts-read-all').disabled=unread===0;
  }
  category.addEventListener('change',refresh);filter.addEventListener('change',refresh);
  for(const row of rows)row.querySelector('input').addEventListener('change',refresh);
  if(local)find('alerts-read-all').addEventListener('click',()=>{for(const row of rows)row.querySelector('input').checked=true;refresh();});
  refresh();
 }
}
const css=`
*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%}body{padding:12px 16px 16px;background:var(--sherlock-bg);color:var(--sherlock-text);font:12px/18px var(--sherlock-font-sans);overflow:auto}main{display:flex;flex-direction:column;gap:12px;min-width:0}p,h2{margin:0}h2{font-size:16px;line-height:24px;min-width:0;overflow-wrap:anywhere}.workflow-head,.workflow-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.workflow-head h2{flex:1}.workflow-tag{font-size:11px;padding:2px 8px;border-radius:4px;background:var(--sherlock-control-bg);color:var(--sherlock-muted);white-space:nowrap}.workflow-muted{font-size:11px;line-height:17px;color:var(--sherlock-muted);overflow-wrap:anywhere}.workflow-list{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--sherlock-border);padding-top:12px}.approval-entry{display:flex;gap:12px;align-items:flex-start;min-width:0}.approval-copy{flex:1;min-width:0;overflow-wrap:anywhere}.approval-copy strong{display:block;font-size:12px;line-height:18px}.approval-copy p{white-space:pre-wrap;margin-top:4px;overflow-wrap:anywhere}.workflow-actions{border-top:1px solid var(--sherlock-border);padding-top:12px;display:flex;flex-wrap:wrap;gap:8px}.workflow-actions textarea{flex-basis:100%;width:100%;resize:vertical;min-height:52px;font:inherit}.workflow-note{white-space:pre-wrap;overflow-wrap:anywhere}button,select,textarea{font:inherit;background:var(--sherlock-control-bg);color:var(--sherlock-control-text);border:1px solid var(--sherlock-control-border);border-radius:4px;padding:5px 8px}button,select{cursor:pointer}button:disabled{cursor:default;opacity:.65}button:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:2px}.workflow-tools h2{flex:1}.alert-entry{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px 12px;align-items:start;min-width:0}.alert-copy{min-width:0;overflow-wrap:anywhere}.alert-copy strong{font-size:12px;line-height:18px}.alert-entry[data-read="true"] .alert-copy strong{font-weight:400}.alert-entry p{margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere}.alert-entry input{width:16px;height:16px;margin:2px 0 0;accent-color:var(--sherlock-control-primary)}details{margin-top:4px}summary{cursor:pointer;font-size:11px;color:var(--sherlock-muted)}#workflow-error:empty{display:none}[hidden]{display:none!important}@media(max-width:360px){body{padding:10px 12px}.workflow-head h2{flex-basis:100%}.workflow-tools{gap:8px}.alert-entry{gap:8px}.approval-entry{gap:8px}}
@layer ework-workbench{body :is(.workflow-actions,.workflow-tools) button{background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border:1px solid var(--sherlock-control-border)!important;padding:4px 8px!important}body:is([data-research-kind="approval"],[data-research-kind="alerts"]){padding:12px 16px 16px!important}body .alert-entry input[type="checkbox"]{width:16px!important;height:16px!important;min-height:0!important;padding:0!important}@media(max-width:360px){body:is([data-research-kind="approval"],[data-research-kind="alerts"]){padding:10px 12px!important}}}
`;
export function renderWorkflowArtifact(spec){
 const template=WORKFLOW_TEMPLATES.find(t=>t.id===spec?.type);
 if(!template||workflowDataIssue(spec))return null;
 const local=spec.mode==='local',approval=spec.type==='approval';
 const rows=spec.items.map((item,index)=>approval?`<article class="approval-entry"><div class="approval-copy"><strong>${escape(item.reviewer)} · ${escape(item.stage)}</strong>${item.comment?`<p class="workflow-muted">${escape(item.comment)}</p>`:''}${item.date?`<p class="workflow-muted">${escape(item.date)}</p>`:''}</div><span class="workflow-tag">${statusText[item.status]}</span></article>`:
 `<article class="alert-entry" data-category="${escape(item.category)}" data-read="${item.read}"><span class="workflow-tag">${escape(item.category)}</span><div class="alert-copy"><strong>${escape(item.title)}</strong><details><summary>查看内容</summary><p>${escape(item.summary)}</p></details><p class="workflow-muted">${escape(item.date)}</p></div><input id="alert-read-${index}" type="checkbox" aria-label="已读 ${escape(item.title)}"${item.read?' checked':''}${local?'':' disabled'}></article>`).join('');
 const head=approval?`<div class="workflow-head"><h2>${escape(spec.subject)}</h2><span class="workflow-tag">${statusText[spec.status]}</span></div><p class="workflow-muted">申请人：${escape(spec.applicant)} · 提交于 ${escape(spec.submittedAt)}</p>`:
 `<div class="workflow-tools">${spec.subject?`<h2>${escape(spec.subject)}</h2>`:''}<span id="alert-count" class="workflow-muted" role="status"></span><select id="alert-category" aria-label="提醒分类"><option value="">全部分类</option>${[...new Set(spec.items.map(i=>i.category))].map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('')}</select><select id="alert-filter" aria-label="提醒阅读状态"><option value="">全部提醒</option><option value="unread">未读提醒</option></select>${local?'<button id="alerts-read-all" type="button">全部标记已读</button>':''}</div>`;
 const actions=approval&&local?'<div class="workflow-actions"><textarea id="review-reason" maxlength="2000" placeholder="个人审阅意见" aria-label="个人审阅意见"></textarea><button type="button" data-review-decision="approved">记录同意</button><button type="button" data-review-decision="rejected">记录退回修改</button></div><p id="personal-review" class="workflow-muted workflow-note" role="status" hidden></p>':'';
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body data-research-kind="${spec.type}" data-sherlock-template="${template.id}"><main>${head}<div class="workflow-list">${rows}</div>${approval?'':'<p id="alert-empty" class="workflow-muted" hidden>当前筛选没有提醒</p>'}${actions}<p id="workflow-error" class="workflow-muted" role="alert"></p><p class="workflow-muted workflow-note">${escape([spec.asOf,spec.note,local?(approval?'个人审阅记录，不改变来源审批状态':'已读标记仅保存到当前画布'):null].filter(Boolean).join(' · '))}</p></main><script>(${workflowRuntime.toString()})(${JSON.stringify(spec.type)},${local});</script></body></html>`;
 return {version:1,type:'html',title:spec.title,html};
}
