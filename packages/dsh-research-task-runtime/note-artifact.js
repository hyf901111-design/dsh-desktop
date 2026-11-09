import {noteDataIssue,noteMarkdownHtml,noteMarkdownNodes,noteEditActions,noteReduce,validNoteContent,validNoteState} from './note-template-contract.js';
import {NOTE_TOOLBAR_ASSETS} from './note-toolbar-assets.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toolbar=[['bold','加粗',0],['italic','斜体',2],['strike','删除线',5],['underline','下划线',3],['link','插入链接',7],['bullets','无序列表',6],['numbers','有序列表',8],['left','左对齐',9],['center','居中对齐',4],['right','右对齐',10],['color','文字颜色',1]];
function noteRuntime(spec){
 const get=id=>document.getElementById(id),editor=get('note-editor'),preview=get('note-preview'),original=get('note-original'),status=get('note-status');
 let handle,context={connected:false,readOnly:true},current={content:spec.content,view:spec.content?'preview':'edit',align:'left'},draft=spec.content,pending=null,selection=[0,0];
 const announce=text=>{status.textContent=text};
 function render(state,nextContext){
  context=nextContext;if(!validNoteState(state)){announce('草稿格式无效，原始材料仍可查看');return;}current=state;
  if(pending===state.content)pending=null;
  if(pending===null){draft=state.content;if(editor.value!==draft)editor.value=draft;}
  editor.hidden=state.view!=='edit';preview.hidden=state.view!=='preview';original.hidden=state.view!=='source';
  noteMarkdownNodes(preview,state.content);preview.style.textAlign=state.align;
  editor.readOnly=context.readOnly||!context.connected;
  for(const button of document.querySelectorAll('[data-note-format]'))button.disabled=editor.readOnly;
  for(const button of document.querySelectorAll('[data-note-view]')){button.disabled=!context.connected;button.setAttribute('aria-pressed',String(button.dataset.noteView===state.view));}
  for(const button of document.querySelectorAll('[data-note-align]'))button.setAttribute('aria-pressed',String(button.dataset.noteAlign===state.align));
  get('note-count').textContent=(pending??state.content).length+' 字';
  announce(!context.connected?'正在连接草稿…':context.readOnly?'只读笔记':pending!==null?'正在保存…':state.content===spec.content?'原始材料':'草稿已保存到本画布');
 }
 function persist(value){
  if(!validNoteContent(value)){editor.value=draft;announce('超过笔记容量（16000字符 / 32000字节），请分卡保存');return false;}
  if(context.readOnly||!context.connected){editor.value=draft;return false;}
  const prior=draft;if(value===prior)return true;
  const actions=noteEditActions(prior,value);if(!actions){editor.value=prior;announce('超过草稿保存容量，请分卡保存');return false;}
  draft=value;pending=value;
  // Bounded patches carry the entire draft through the existing state bridge.
  // JSON escapes count toward transport capacity as well as visible characters.
  for(const action of actions)if(!handle.dispatch(action)){
   pending=null;const saved=handle.getState();draft=saved.content;editor.value=draft;announce('本次编辑未完全保存，请重试');return false;
  }
  get('note-count').textContent=value.length+' 字';return true;
 }
 function changeView(value){if(handle.dispatch({op:'view',value})&&value==='edit')editor.focus();}
 function replaceSelection(before,after,fallback){
  changeView('edit');const [start,end]=selection,text=draft.slice(start,end)||fallback;
  const value=draft.slice(0,start)+before+text+after+draft.slice(end);
  if(persist(value)){editor.value=value;editor.focus();editor.setSelectionRange(start+before.length,start+before.length+text.length);selection=[editor.selectionStart,editor.selectionEnd];}
 }
 function format(kind){
  if(context.readOnly||!context.connected)return;
  if(['left','center','right'].includes(kind)){handle.dispatch({op:'align',value:kind});return;}
  if(kind==='link'){get('note-link-panel').hidden=!get('note-link-panel').hidden;get('note-link-url').focus();return;}
  if(kind==='color'){get('note-color-panel').hidden=!get('note-color-panel').hidden;return;}
  const wrappers={bold:['**','**','加粗文字'],italic:['*','*','斜体文字'],strike:['~~','~~','删除线文字'],underline:['++','++','下划线文字']};
  if(wrappers[kind]){replaceSelection(...wrappers[kind]);return;}
  changeView('edit');let [start,end]=selection;start=draft.lastIndexOf('\n',Math.max(0,start-1))+1;
  const next=draft.indexOf('\n',end);end=next<0?draft.length:next;
  const rows=(draft.slice(start,end)||'列表条目').split('\n').map((line,i)=>(kind==='numbers'?(i+1)+'. ':'- ')+line.replace(/^\s*(?:[-+*]|\d+[.)])\s+/,''));
  const value=draft.slice(0,start)+rows.join('\n')+draft.slice(end);
  if(persist(value)){editor.value=value;editor.focus();editor.setSelectionRange(start,start+rows.join('\n').length);selection=[editor.selectionStart,editor.selectionEnd];}
 }
 editor.value=spec.content;original.value=spec.content;
 for(const event of ['select','keyup','click'])editor.addEventListener(event,()=>{selection=[editor.selectionStart,editor.selectionEnd]});
 editor.addEventListener('input',()=>{const range=[editor.selectionStart,editor.selectionEnd];persist(editor.value);editor.setSelectionRange(...range);selection=range;});
 editor.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&!event.altKey&&['b','i','k'].includes(event.key.toLowerCase())){event.preventDefault();format({b:'bold',i:'italic',k:'link'}[event.key.toLowerCase()]);}});
 for(const button of document.querySelectorAll('[data-note-format]')){button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>format(button.dataset.noteFormat));}
 for(const button of document.querySelectorAll('[data-note-view]'))button.addEventListener('click',()=>changeView(button.dataset.noteView));
 for(const button of document.querySelectorAll('[data-note-color]'))button.addEventListener('click',()=>{replaceSelection('{color:'+button.dataset.noteColor+'}','{/color}','彩色文字');get('note-color-panel').hidden=true;});
 get('note-link-add').addEventListener('click',()=>{const url=get('note-link-url').value.trim();try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||url.length>2048||/[\s)]/.test(url))throw Error();replaceSelection('[',']('+u.href+')','链接文字');get('note-link-panel').hidden=true;}catch{announce('请输入不带登录信息的完整 http 或 https 链接');}});
 handle=window.sherlockShared.register({initialState:current,reduce:noteReduce,render});
}
const css=`*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%}body{padding:10px;background:var(--sherlock-bg);color:var(--sherlock-text);font:12px/18px var(--sherlock-font-sans);overflow:auto}main{display:flex;flex-direction:column;gap:8px;min-width:0}.note-toolbar{display:flex;gap:2px;flex-wrap:wrap;align-items:center;padding:4px;background:var(--sherlock-surface-muted);border-radius:4px}.note-toolbar button{display:grid;place-items:center;width:24px;height:24px;flex:0 0 24px;padding:3px;border:0;border-radius:3px;background:transparent;color:var(--sherlock-text)}.note-toolbar img{width:18px;height:18px;pointer-events:none}.note-toolbar button:hover,.note-toolbar button[aria-pressed="true"]{background:var(--sherlock-row-selected)}.note-toolbar button:disabled{opacity:.45}.note-surface{height:190px;min-height:190px;max-height:190px;overflow:auto;min-width:0}.note-surface textarea{width:100%;height:100%;min-height:190px;resize:none;border:0;background:var(--sherlock-bg);color:var(--sherlock-text);font:12px/20px var(--sherlock-font-sans);padding:4px;white-space:pre-wrap;overflow-wrap:anywhere}.note-preview{padding:4px;overflow-wrap:anywhere}.note-preview :is(h1,h2,h3,h4,h5,h6){margin:8px 0;font-size:14px;line-height:22px}.note-preview p{margin:0 0 8px}.note-preview :is(ul,ol){margin:4px 0 8px;padding-left:22px}.note-preview pre{margin:8px 0;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--sherlock-surface-muted)}.note-preview :is(code,pre){font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.note-preview blockquote{margin:8px 0;padding-left:8px;border-left:2px solid var(--sherlock-border);color:var(--sherlock-muted)}.note-preview :is(td,th){white-space:normal!important;overflow-wrap:anywhere!important}.note-footer{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--sherlock-muted)}.note-footer button{font:inherit;padding:2px 6px;background:var(--sherlock-control-bg);color:var(--sherlock-control-text);border:1px solid var(--sherlock-control-border);border-radius:4px;cursor:pointer}.note-footer button[aria-pressed="true"]{color:var(--sherlock-control-primary);border-color:var(--sherlock-control-primary)}#note-provenance{flex:1 1 180px;min-width:0;overflow-wrap:anywhere}#note-status{margin:0;font-size:11px;line-height:17px;color:var(--sherlock-muted);overflow-wrap:anywhere}.note-popover{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.note-popover input{flex:1 1 150px;min-width:0;font:inherit;padding:4px 6px;background:var(--sherlock-control-bg);color:var(--sherlock-control-text);border:1px solid var(--sherlock-control-border);border-radius:4px}.note-popover button{font:inherit;padding:4px 6px}.note-color{min-width:32px;height:24px;border:1px solid var(--sherlock-control-border);border-radius:3px;color:var(--sherlock-control-text);background:var(--sherlock-control-bg)}button:focus-visible,textarea:focus-visible,input:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:-1px}[hidden]{display:none!important}:root:is([data-workbench-style="dark"],[data-workbench-style="openterminal"],[data-sherlock-theme="dark"]:not([data-workbench-style])) .note-toolbar img{filter:brightness(0) invert(1)}@layer ework-workbench{body[data-research-kind="note"]{padding:10px!important}body .note-toolbar button{min-height:24px!important;padding:3px!important;border:0!important;background:transparent!important}body .note-toolbar button[aria-pressed="true"],body .note-toolbar button:hover{background:var(--sherlock-row-selected)!important}body .note-footer button{background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border:1px solid var(--sherlock-control-border)!important;padding:2px 6px!important}body .note-footer button[aria-pressed="true"]{color:var(--sherlock-control-primary)!important;border-color:var(--sherlock-control-primary)!important}body .note-toolbar img{width:18px!important;height:18px!important}body .note-surface textarea{min-height:190px!important;font:12px/20px var(--sherlock-font-sans)!important;border:0!important;padding:4px!important;background:var(--sherlock-bg)!important;color:var(--sherlock-text)!important}body .note-color{background:var(--sherlock-control-bg)!important;padding:0!important;min-height:24px!important}}`;
export function renderNoteArtifact(spec){
 if(noteDataIssue(spec))return null;
 const json=JSON.stringify(spec).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const buttons=toolbar.map(([kind,label,index])=>`<button type="button" data-note-format="${kind}"${['left','center','right'].includes(kind)?` data-note-align="${kind}"`:''} aria-label="${label}" title="${label}"><img alt="" src="${NOTE_TOOLBAR_ASSETS[index]}"></button>`).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body data-research-kind="note" data-sherlock-template="note"><main><div class="note-toolbar" role="toolbar" aria-label="Markdown 格式工具">${buttons}</div><div class="note-popover" id="note-link-panel" data-workbench-state-owned hidden><input id="note-link-url" aria-label="链接地址" placeholder="https://"><button type="button" id="note-link-add">插入</button></div><div class="note-popover" id="note-color-panel" hidden>${['#005096','#0078b4','#008565','#c62f36','#65717a'].map((color,i)=>`<button type="button" class="note-color" data-note-color="${color}" aria-label="${['深蓝','蓝色','绿色','红色','灰色'][i]}">${['深蓝','蓝','绿','红','灰'][i]}</button>`).join('')}</div><section class="note-surface" data-workbench-state-owned><textarea id="note-editor" aria-label="Markdown 笔记内容" placeholder="点击此处，开始记录你的研究笔记。" hidden></textarea><div id="note-preview" class="note-preview" aria-label="格式预览">${noteMarkdownHtml(spec.content)}</div><textarea id="note-original" aria-label="原始材料" readonly hidden>${escape(spec.content)}</textarea></section><div class="note-footer"><button type="button" data-note-view="edit">编辑</button><button type="button" data-note-view="preview">预览</button><button type="button" data-note-view="source">原始材料</button><span id="note-count"></span><span id="note-provenance">${escape(spec.asOf)}</span></div><p id="note-status" role="status"></p></main><script>const validNoteContent=${validNoteContent.toString()},validNoteState=${validNoteState.toString()},noteReduce=${noteReduce.toString()},noteMarkdownHtml=${noteMarkdownHtml.toString()},noteMarkdownNodes=${noteMarkdownNodes.toString()},noteEditActions=${noteEditActions.toString()};(${noteRuntime.toString()})(${json});</script></body></html>`;
 return {version:1,type:'html',title:spec.title,html};
}
