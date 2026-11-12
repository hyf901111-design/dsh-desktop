import {INPUT_TEMPLATES,inputDataIssue} from './input-template-contract.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Reserve room for controls, status and provenance in the existing card size.
// Expanded code can scroll in the card; collapsed code scrolls in its own box.
export const CODE_VIEWPORT_CSS='body[data-research-kind="code"] main{height:calc(100vh - 28px);min-height:0;gap:10px}body[data-research-kind="code"] main>*{flex-shrink:0}body[data-research-kind="code"] #code-status:empty{display:none}body[data-research-kind="code"] .code-content{flex:1 1 180px;min-height:64px;max-height:180px}body[data-research-kind="code"] .code-content.expanded{flex:none;max-height:none}';
function inputRuntime(spec){
 const get=id=>document.getElementById(id);
 if(spec.type==='form'){
  const form=get('input-form'),submit=get('form-submit'),records=get('form-records'),reset=get('form-reset'),status=get('form-status');
  let submitted=false,state={version:1,entries:[]},canSubmit=true;
  const errorFor=(f,raw)=>{
   const value=raw.trim();let error='';
   if(f.required&&!value)error='请填写'+f.label;
   else if(raw.length>(f.maxLength??4000))error='最多'+(f.maxLength??4000)+'字';
   else if(value&&f.kind==='number'&&(!Number.isFinite(Number(value))||f.min!==undefined&&Number(value)<f.min||f.max!==undefined&&Number(value)>f.max))error='请输入有效数值'+(f.min!==undefined?'，最小 '+f.min:'')+(f.max!==undefined?'，最大 '+f.max:'');
   else if(value&&f.kind==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))error='请输入有效日期';
   else if(value&&f.kind==='select'&&!f.options.some(option=>option.value===value))error='请选择有效选项';
   return error;
  };
  const validate=f=>{
   const control=get('field-'+f.id),error=errorFor(f,control.value);
   get('error-'+f.id).textContent=error;control.setAttribute('aria-invalid',String(Boolean(error)));return !error;
  };
  const validEntry=entry=>Array.isArray(entry)&&entry.length===spec.fields.length&&entry.every((value,index)=>typeof value==='string'&&!errorFor(spec.fields[index],value));
  const setControls=()=>{submit.disabled=!canSubmit||submitted||state.entries.length>=20;reset.disabled=!canSubmit;};
  const render=(saved,context)=>{
   const entries=saved?.version===1&&Array.isArray(saved.entries)?saved.entries.filter(validEntry).slice(0,20):[];
   state={version:1,entries};canSubmit=context.connected&&!context.readOnly;
   records.replaceChildren(...entries.map((entry,index)=>{
    const article=document.createElement('article'),heading=document.createElement('strong');
    heading.textContent='本地输入记录 '+(entries.length-index);article.append(heading);
    spec.fields.forEach((f,i)=>{
     const p=document.createElement('p'),value=entry[i],label=f.kind==='select'?f.options.find(option=>option.value===value)?.label:value;
     p.textContent=f.label+'：'+(label||'—');article.append(p);
    });
    return article;
   }));
   records.hidden=!entries.length;
   if(context.connected&&context.readOnly)status.textContent='当前工作台为只读，不能提交本地记录。';
   setControls();
  };
  const reduce=(current,action)=>action?.type==='submit'&&validEntry(action.entry)&&Array.isArray(current?.entries)&&current.entries.length<20
   ? {version:1,entries:[action.entry,...current.entries]} : current;
  const shared=typeof window==='undefined'?null:window.sherlockShared?.register({initialState:state,localOnly:true,reduce,render});
  for(const f of spec.fields){const control=get('field-'+f.id);control.addEventListener('blur',()=>validate(f));for(const name of ['input','change'])control.addEventListener(name,()=>{submitted=false;setControls();status.textContent='';if(control.getAttribute('aria-invalid')==='true')validate(f);});}
  form.addEventListener('submit',e=>e.preventDefault());
  submit.addEventListener('click',()=>{
   if(!canSubmit||submitted||state.entries.length>=20)return;
   const invalid=spec.fields.filter(f=>!validate(f));if(invalid.length){get('field-'+invalid[0].id).focus();return;}
   const action={type:'submit',entry:spec.fields.map(f=>get('field-'+f.id).value)};
   const next=reduce(state,action);
   if(new TextEncoder().encode(JSON.stringify(next)).length>65536){status.textContent='本卡输入记录已达存储容量，现有记录已保留。';return;}
   if(shared&&!shared.dispatch(action)){status.textContent='本次记录未保存，请重试。';return;}
   if(!shared)render(next,{connected:true,readOnly:false});
   submitted=true;setControls();
   status.textContent=(shared?'已保存本画布的输入记录':'已记录，本次打开期间可查看')+(next.entries.length>=20?'，已达20条记录上限':'');
  });
  reset.addEventListener('click',()=>{form.reset();submitted=false;setControls();status.textContent='';for(const f of spec.fields){get('error-'+f.id).textContent='';get('field-'+f.id).setAttribute('aria-invalid','false');}});
 }else{
  const format=get('code-format'),output=get('code-content'),status=get('code-status'),expand=get('code-expand');let requestId=null,requestTimer=null;
  function render(){let content=spec.content;get('code-error').textContent='';if(spec.language==='json'){try{const parsed=JSON.parse(content);if(format.value==='formatted')content=JSON.stringify(parsed,null,2);}catch{get('code-error').textContent='JSON 格式无效，已保留原始内容';format.value='original';}}
   output.replaceChildren();for(const [i,line]of content.split('\n').entries()){const row=document.createElement('div'),number=document.createElement('span'),code=document.createElement('code');number.textContent=String(i+1).padStart(2,'0');number.className='line-number';code.textContent=line||' ';row.append(number,code);output.append(row);}get('code-lines').textContent=content.split('\n').length+' 行 · UTF-8';status.textContent='';
  }
  format.addEventListener('change',render);expand.addEventListener('click',()=>{output.classList.toggle('expanded');expand.textContent=output.classList.contains('expanded')?'收起长内容':'展开长内容';});
  for(const button of document.querySelectorAll('[data-code-action]'))button.addEventListener('click',event=>{
   // Replaying a saved view must never copy or open a save dialog again.
   if(!event.isTrusted||requestId)return;
   requestId='code-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);status.textContent=button.dataset.codeAction==='copy'?'正在复制…':'请选择保存位置…';
   // A native save dialog may legitimately stay open for several minutes.
   // Its definitive result releases the request; copying has a short timeout.
   requestTimer=button.dataset.codeAction==='copy'?setTimeout(()=>{requestId=null;status.textContent='操作未完成，请重试';},10000):null;
   parent.postMessage({type:'sherlock-code-action',id:requestId,action:button.dataset.codeAction,format:format.value},'*');
  });
  addEventListener('message',event=>{const d=event.data;if(event.source!==parent||d?.type!=='sherlock-code-action-result'||d.id!==requestId||Object.keys(d).length!==3||!['copied','saved','cancelled','error'].includes(d.status))return;clearTimeout(requestTimer);requestId=null;status.textContent={copied:'代码已复制',saved:'代码已保存',cancelled:'已取消保存',error:'操作失败，请重试'}[d.status];});
  render();
 }
}
export const INPUT_VIEW_RUNTIME=inputRuntime.toString();
const css=`*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%}body{padding:12px 16px 16px;background:var(--sherlock-bg);color:var(--sherlock-text);font:12px/18px var(--sherlock-font-sans);overflow:auto}main{display:flex;flex-direction:column;gap:12px;min-width:0}h2,p{margin:0}h2{font-size:16px;line-height:24px;overflow-wrap:anywhere}.input-muted{color:var(--sherlock-muted);font-size:11px;line-height:17px;overflow-wrap:anywhere}.input-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.input-field{display:flex;flex-direction:column;gap:4px;min-width:0}.input-field:first-child,.input-field:has(textarea){grid-column:1/-1}.input-field input,.input-field textarea,.input-field select{width:100%;min-width:0;font:inherit;padding:6px 8px;min-height:30px;border:1px solid var(--sherlock-control-border);border-radius:4px;background:var(--sherlock-control-bg);color:var(--sherlock-control-text)}textarea{resize:vertical;min-height:64px!important}.input-error:empty{display:none}.input-error{color:var(--sherlock-text);font-size:11px;line-height:17px}.input-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}button,select{font:inherit;cursor:pointer}button:disabled{opacity:.65;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:2px}[aria-invalid="true"]{border-color:var(--sherlock-control-primary)!important}.input-tag{background:var(--sherlock-control-bg);color:var(--sherlock-muted);border-radius:4px;padding:2px 8px;font-size:11px}.input-records{display:flex;flex-direction:column;gap:12px}.input-records article{padding-top:12px;border-top:1px solid var(--sherlock-border);overflow-wrap:anywhere;white-space:pre-wrap}.code-content{background:var(--sherlock-surface-muted);padding:12px;border-radius:4px;overflow:auto;max-height:180px;min-height:120px;white-space:pre;font:11px/20px ui-monospace,SFMono-Regular,Menlo,monospace}.code-content>div{display:flex;min-width:max-content;gap:12px}.line-number{width:24px;text-align:right;flex:none;color:var(--sherlock-muted);user-select:none}.code-content.expanded{max-height:none}.code-content code{font:inherit}[hidden]{display:none!important}@media(max-width:440px){.input-fields{grid-template-columns:minmax(0,1fr)}body{padding:10px 12px}.input-tools{gap:6px}}@layer ework-workbench{body[data-research-kind="code"] .code-content,body[data-research-kind="code"] .code-content *{font-family:ui-monospace,SFMono-Regular,Menlo,"Noto Sans SC",monospace!important;font-weight:400!important}body[data-research-kind="form"],body[data-research-kind="code"]{padding:12px 16px 16px!important}body .input-tools button,body .input-tools select{background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border:1px solid var(--sherlock-control-border)!important;border-radius:4px!important;padding:4px 8px!important}@media(max-width:360px){body[data-research-kind="form"],body[data-research-kind="code"]{padding:10px 12px!important}}}`;
export function renderInputArtifact(spec){
 const template=INPUT_TEMPLATES.find(t=>t.id===spec?.type);if(!template||inputDataIssue(spec))return null;
 const content=spec.type==='form'?`<h2>${escape(spec.subject||'填写需求')}</h2><form id="input-form" novalidate><div class="input-fields">${spec.fields.map(f=>{
  const id='field-'+f.id,attributes=`id="${id}" aria-label="${escape(f.label)}" aria-describedby="help-${f.id} error-${f.id}"${f.required?' aria-required="true"':''} maxlength="${f.maxLength??4000}"${f.placeholder?` placeholder="${escape(f.placeholder)}"`:''}`;
  const control=f.kind==='select'?`<select ${attributes}><option value="">请选择</option>${f.options.map(o=>`<option value="${escape(o.value)}"${o.value===f.value?' selected':''}>${escape(o.label)}</option>`).join('')}</select>`:f.kind==='textarea'?`<textarea ${attributes}>${escape(f.value)}</textarea>`:`<input type="text"${f.kind==='number'?' inputmode="decimal"':''} ${attributes} value="${escape(f.value)}">`;
  return `<div class="input-field"><label for="${id}">${escape(f.label)}${f.required?' *':''}</label>${control}<p id="help-${f.id}" class="input-muted">${escape(f.help)}</p><p id="error-${f.id}" class="input-error" role="alert"></p></div>`;
 }).join('')}</div></form><div class="input-tools"><button type="button" id="form-submit">保存输入记录</button><button type="button" id="form-reset">重置填写</button></div><p id="form-status" class="input-muted" role="status"></p><section id="form-records" class="input-records" aria-label="本地输入记录" hidden></section><p class="input-muted">输入记录仅保存到本画布</p>`:
 `<div class="input-tools"><span class="input-tag">${escape(spec.language.toUpperCase())}</span><select id="code-format" aria-label="代码格式"${spec.language!=='json'?' hidden':''}><option value="original">原始格式</option>${spec.language==='json'?'<option value="formatted">格式化 JSON</option>':''}</select><button type="button" data-code-action="copy">复制代码</button><button type="button" data-code-action="download">下载</button></div><p id="code-error" class="input-error" role="alert"></p><div id="code-content" class="code-content" tabindex="0" aria-label="代码内容"></div><div class="input-tools"><span id="code-lines" class="input-muted"></span><button type="button" id="code-expand">展开长内容</button></div><p id="code-status" class="input-muted" role="status"></p>`;
 const json=JSON.stringify(spec).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return {version:1,type:'html',title:spec.title,html:`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body data-research-kind="${spec.type}" data-sherlock-template="${spec.type}"><main>${content}<p class="input-muted">${escape([spec.asOf,spec.note].filter(Boolean).join(' · '))}</p></main><script>(${inputRuntime.toString()})(${json});</script></body></html>${spec.type==='code'?`<style data-code-viewport="v2">${CODE_VIEWPORT_CSS}</style>`:''}`};
}
