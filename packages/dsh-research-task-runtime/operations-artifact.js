import {OPERATIONS_TEMPLATES,operationsDataIssue} from './operations-template-contract.js';
import {OPERATIONS_HEADER_CSS} from './workbench-reading-layout.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=v=>Number(v.toPrecision(8)).toLocaleString('en-US');
const percent=(current,target)=>format(current/target*100)+'%';
function operationsRuntime(type,local){
 const find=id=>document.getElementById(id),count=find('operation-count');
 if(type==='progress'){
  const entries=[...document.querySelectorAll('.progress-entry')];
  function update(){
   let current=0,target=0;
   for(const row of entries){
    const input=row.querySelector('input'),value=input?input.valueAsNumber:Number(row.dataset.current),goal=Number(row.dataset.target);
    if(!Number.isFinite(value)||value<0||value>1e12){find('operation-error').textContent='进度须为有效非负数值';return;}
    current+=value;target+=goal;
    row.querySelector('.progress-values').textContent=Number(value.toPrecision(8)).toLocaleString('en-US')+' / '+Number(goal.toPrecision(8)).toLocaleString('en-US');
    row.querySelector('.progress-percent').textContent=Number((value/goal*100).toPrecision(4)).toLocaleString('en-US')+'%';
   }
   count.textContent='已完成 '+Number(current.toPrecision(8)).toLocaleString('en-US')+' / '+Number(target.toPrecision(8)).toLocaleString('en-US')+' '+count.dataset.unit;
   const bar=find('overall-progress');bar.value=current;bar.max=target;
   bar.setAttribute('aria-valuetext',Number((current/target*100).toPrecision(4)).toLocaleString('en-US')+'%');
   find('operation-error').textContent='';
  }
  for(const input of document.querySelectorAll('.progress-entry input'))input.addEventListener('input',update);
 }else{
  const list=find('task-list'),filter=find('task-filter'),owner=find('task-owner'),form=find('add-task-form');let serial=0;
  function refresh(){
   const rows=[...list.querySelectorAll('.task-entry')],done=rows.filter(r=>r.querySelector('input').checked).length;
   count.textContent=done+' / '+rows.length+' 已完成';
   let shown=0;
   for(const row of rows){const checked=row.querySelector('input').checked;row.dataset.completed=String(checked);const statusHidden=filter.value==='todo'?checked:filter.value==='done'?!checked:filter.value.startsWith('status:')?row.dataset.status!==filter.value.slice(7):false;row.hidden=statusHidden||Boolean(owner?.value&&row.dataset.owner!==owner.value);if(!row.hidden)shown++;}
   const empty=find('task-empty');
   empty.hidden=shown>0;
   empty.textContent=!rows.length&&local?'添加第一项任务，开始记录。':'当前筛选没有任务';
   const visible=find('task-visible');visible.textContent='显示 '+shown+' / '+rows.length+' 条';visible.hidden=filter.value===''&&!owner?.value;
  }
  list.addEventListener('change',refresh);filter.addEventListener('change',refresh);owner?.addEventListener('change',refresh);
  if(local){
   find('add-task').addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden)find('new-task-title').focus();});
   form.addEventListener('submit',event=>{
    event.preventDefault();const title=find('new-task-title').value.trim(),rows=list.querySelectorAll('.task-entry');
    if(!title||title.length>256||rows.length>=100){find('operation-error').textContent=rows.length>=100?'清单最多100条，请拆分清单':'请填写1–256字任务标题';return;}
    const row=document.createElement('article'),label=document.createElement('label'),input=document.createElement('input'),copy=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');
    row.className='task-entry';input.type='checkbox';input.id='local-task-'+serial++;input.setAttribute('aria-label','完成 '+title);strong.textContent=title;small.textContent='本地任务';copy.className='task-copy';copy.append(strong,small);label.append(input,copy);row.append(label);list.append(row);form.hidden=true;find('operation-error').textContent='';refresh();
   });
  }
  refresh();
 }
}
const css=`
*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%}body{padding:12px 16px 16px;background:var(--sherlock-bg);color:var(--sherlock-text);font:12px/18px var(--sherlock-font-sans);overflow:auto}main{display:flex;flex-direction:column;gap:12px;min-width:0}p,h2{margin:0}.operation-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.operation-head h2{font-size:16px;line-height:24px;flex:1;min-width:0;overflow-wrap:anywhere}.operation-tag{padding:2px 8px;background:var(--sherlock-control-bg);color:var(--sherlock-muted);border-radius:4px;font-size:11px}.muted{color:var(--sherlock-muted);font-size:11px;line-height:16px}.operation-count{color:var(--sherlock-muted);font-variant-numeric:tabular-nums}progress{display:block;width:100%;height:6px;appearance:none;border:0;border-radius:3px;overflow:hidden;background:var(--sherlock-surface-muted);color:var(--sherlock-chart-1)}progress::-webkit-progress-bar{background:var(--sherlock-surface-muted)}progress::-webkit-progress-value{background:var(--sherlock-chart-1);border-radius:3px}.progress-entry{display:flex;align-items:center;gap:12px;min-height:28px;flex-wrap:wrap}.progress-copy{flex:1;min-width:100px;overflow-wrap:anywhere}.progress-values{font-variant-numeric:tabular-nums;color:var(--sherlock-muted);white-space:nowrap}.progress-percent{padding:2px 8px;background:var(--sherlock-control-bg);border-radius:4px;font-size:11px;color:var(--sherlock-muted)}.progress-entry input{width:90px;min-width:0}button,input,select{font:inherit;color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border);border-radius:4px;padding:5px 8px}button,select{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:2px}.operation-footer{display:flex;align-items:center;flex-wrap:wrap;gap:12px;border-top:1px solid var(--sherlock-border);padding-top:12px}.operation-footer .muted{flex:1;min-width:100px}.operation-note{white-space:pre-wrap;overflow-wrap:anywhere}.task-list{display:flex;flex-direction:column;gap:12px}.task-entry{min-width:0}.task-entry label{display:flex;gap:12px;align-items:flex-start}.task-entry input{flex:0 0 auto;width:16px;height:16px;margin:2px 0 0;accent-color:var(--sherlock-control-primary)}.task-copy{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px;flex:1;min-width:0;overflow-wrap:anywhere}.task-copy strong{display:block;min-width:0;font-size:12px;font-weight:400}.task-copy small{display:block;font-size:11px;line-height:16px;color:var(--sherlock-muted)}.task-entry[data-completed="true"] strong{color:var(--sherlock-muted)}.task-entry details{margin-left:28px;font-size:11px;color:var(--sherlock-muted)}details p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}summary{cursor:pointer}#add-task-form{display:flex;gap:8px;flex-wrap:wrap}#new-task-title{flex:1;min-width:120px}#operation-error:empty{display:none}[hidden]{display:none!important}@media(max-width:360px){body{padding:10px 12px}.operation-head h2{flex-basis:100%}.progress-entry{gap:8px}.progress-copy{flex-basis:100%}.operation-footer{gap:8px}}
@layer ework-workbench{body:is([data-research-kind="progress"],[data-research-kind="tasks"]){padding:12px 16px 16px!important}body .task-entry input[type="checkbox"]{width:16px!important;height:16px!important;min-height:0!important;padding:0!important}@media(max-width:360px){body:is([data-research-kind="progress"],[data-research-kind="tasks"]){padding:10px 12px!important}}}
${OPERATIONS_HEADER_CSS}`;
export function renderOperationsArtifact(spec){
 if(!['progress','tasks'].includes(spec?.type))return null;
 const template=OPERATIONS_TEMPLATES.find(t=>t.id===spec?.type);
 if(!template||operationsDataIssue(spec))return null;
 const local=spec.mode==='local',isProgress=spec.type==='progress';
 const total= isProgress?spec.items.reduce((t,i)=>({current:t.current+i.current,target:t.target+i.target}),{current:0,target:0}):null;
 const count=isProgress?`已完成 ${format(total.current)} / ${format(total.target)} ${escape(spec.unit??'项')}`:`${spec.items.filter(i=>i.completed).length} / ${spec.items.length} 已完成`;
 const heading=spec.subject?`<h2>${escape(spec.subject)}</h2>`:'';
 const rows=isProgress?spec.items.map((item,index)=>`<section class="progress-entry" data-current="${item.current}" data-target="${item.target}"><div class="progress-copy">${escape(item.label)}${item.detail?`<p class="muted">${escape(item.detail)}</p>`:''}</div><span class="progress-values">${format(item.current)} / ${format(item.target)}</span><span class="progress-percent">${percent(item.current,item.target)}</span>${local?`<input id="progress-${index}" type="number" min="0" max="1000000000000" step="any" value="${item.current}" aria-label="${escape(item.label)}已完成值">`:''}</section>`).join(''):
 spec.items.map((item,index)=>`<article class="task-entry" data-completed="${item.completed}" data-status="${escape(item.status??'')}" data-owner="${escape(item.owner??'')}"><label><input id="task-${index}" type="checkbox"${item.completed?' checked':''}${local?'':' disabled'} aria-label="完成 ${escape(item.title)}"><span class="task-copy"><strong>${escape(item.title)}</strong>${item.owner||item.due||item.priority||item.status?`<small>${escape([item.owner,item.due,item.priority,item.status&&`来源状态：${item.status}`].filter(Boolean).join(' · '))}</small>`:''}</span></label>${item.detail?`<details><summary>查看详情</summary><p>${escape(item.detail)}</p></details>`:''}</article>`).join('');
 const statuses=isProgress?[]:[...new Set(spec.items.map(item=>item.status).filter(Boolean))],owners=isProgress?[]:[...new Set(spec.items.map(item=>item.owner).filter(Boolean))];
 const content=isProgress?`<p id="operation-count" class="operation-count" data-unit="${escape(spec.unit??'项')}" role="status">${count}</p><progress id="overall-progress" max="${total.target}" value="${total.current}" aria-label="总体完成进度" aria-valuetext="${percent(total.current,total.target)}"></progress><div>${rows}</div>`:
 `<div class="operation-head">${heading}<span id="operation-count" class="operation-tag" role="status">${count}</span><select id="task-filter" aria-label="筛选任务"><option value="">全部任务</option><option value="todo">未完成</option><option value="done">已完成</option>${statuses.map(status=>`<option value="status:${escape(status)}">来源状态：${escape(status)}</option>`).join('')}</select>${owners.length?`<select id="task-owner" aria-label="筛选负责人"><option value="">全部负责人</option>${owners.map(owner=>`<option value="${escape(owner)}">${escape(owner)}</option>`).join('')}</select>`:''}</div><div id="task-list" class="task-list">${rows}</div><p id="task-empty" class="muted" hidden>当前筛选没有任务</p><p id="task-visible" class="muted" hidden></p>`;
 const footer=isProgress?`${spec.deadline?`<span class="muted">截止 ${escape(spec.deadline)}</span>`:''}`:`${local?'<button id="add-task" type="button">+ 添加任务</button>':''}${spec.owner?`<span class="muted">负责人：${escape(spec.owner)}</span>`:''}`;
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body data-research-kind="${spec.type}" data-sherlock-template="${template.id}"><main>${isProgress&&(heading||spec.status)?`<div class="operation-head">${heading}${spec.status?`<span class="operation-tag">${escape(spec.status)}</span>`:''}</div>`:''}${content}${footer?`<div class="operation-footer">${footer}</div>`:''}${!isProgress&&local?'<form id="add-task-form" hidden><input id="new-task-title" type="text" maxlength="256" required placeholder="任务标题" aria-label="新任务标题"><button type="submit">添加</button></form>':''}<p id="operation-error" role="alert" class="muted"></p><p class="muted operation-note">${escape([spec.asOf,spec.note,local?'个人画布记录，操作不写入外部来源':null].filter(Boolean).join(' · '))}</p></main><script>(${operationsRuntime.toString()})(${JSON.stringify(spec.type)},${local});</script></body></html>`;
 return {version:1,type:'html',title:spec.title,html};
}
