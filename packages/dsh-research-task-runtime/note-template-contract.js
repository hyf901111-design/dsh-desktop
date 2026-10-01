export const NOTE_TEMPLATES=Object.freeze([{id:'note',type:'note',title:'Markdown 笔记',figma:'1917:352841',width:980,height:340,minWidth:280,minHeight:180,version:'21m-note-20261001',interactions:['编辑与格式预览','加粗斜体下划线删除线','链接与列表','对齐与颜色','草稿恢复','原始材料']}]);
export function validNoteContent(value){return typeof value==='string'&&value.length<=16000&&new TextEncoder().encode(value).length<=32000&&new TextEncoder().encode(JSON.stringify(value)).length<=60000;}
export function noteDataIssue(s){
 if(!s||typeof s!=='object'||Array.isArray(s)||s.version!==1||s.type!=='note'||typeof s.title!=='string'||!s.title.trim()||s.title.length>256||typeof s.asOf!=='string'||!s.asOf.trim()||s.asOf.length>2000)return '笔记需version:1、type:note、title、asOf及完整content';
 if(Object.keys(s).some(k=>!['version','type','title','asOf','content'].includes(k)))return '笔记含不支持的字段';
 return validNoteContent(s.content)?null:'笔记content需字符串，最多16000字符/32000 UTF-8字节；长材料请分卡，不截断';
}
export function noteTemplateSchema(type){if(type==='note')return 'version:1,type:"note",title,asOf（原始材料来源及日期）,content:"完整Markdown原文"。content可以为空白新笔记，最多16000字符/32000 UTF-8字节；长材料请分卡，不截断原材料。宿主提供格式编辑、预览和保存在本画布的个人草稿；保留原材料供查看。';}
export function validNoteState(s){return Boolean(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).length===3&&validNoteContent(s.content)&&['edit','preview','source'].includes(s.view)&&['left','center','right'].includes(s.align));}
export function noteReduce(state,action){
 if(!validNoteState(state)||!action||typeof action!=='object'||Array.isArray(action))return state;
 if(action.op==='view'&&Object.keys(action).length===2&&['edit','preview','source'].includes(action.value))return {...state,view:action.value};
 if(action.op==='align'&&Object.keys(action).length===2&&['left','center','right'].includes(action.value))return {...state,align:action.value};
 if(action.op!=='edit'||Object.keys(action).length!==4||![action.start,action.remove].every(Number.isInteger)||action.start<0||action.start>state.content.length||action.remove<0||action.start+action.remove>state.content.length||typeof action.insert!=='string'||action.insert.length>1000)return state;
 const content=state.content.slice(0,action.start)+action.insert+state.content.slice(action.start+action.remove);
 return validNoteContent(content)?{...state,content}:state;
}
// Escaped text is the only input to the inline formatter. Raw HTML stays literal;
// the toolbar's two explicitly generated text decorations use bounded syntax.
export function noteMarkdownHtml(value){
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeUrl=value=>{try{const Url=typeof globalThis.URL==='function'?globalThis.URL:globalThis.window?.URL;const u=new Url(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&value.length<=2048?escape(u.href):null}catch{return null}};
 const inline=raw=>{
  const saved=[],stash=html=>`\u0000${saved.push(html)-1}\u0000`;
  let text=escape(String(raw).replace(/\u0000/g,'\ufffd')).replace(/`([^`\n]+)`/g,(_,s)=>stash('<code>'+s+'</code>'));
  text=text.replace(/\[([^\]\n]{1,512})\]\(([^\s)]+)\)/g,(all,label,url)=>{const href=safeUrl(url.replace(/&amp;/g,'&'));return href?stash(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`):all});
  text=text.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/~~([^~\n]+)~~/g,'<s>$1</s>').replace(/\+\+([^+\n]+)\+\+/g,'<u>$1</u>');
  text=text.replace(/\{color:(#[0-9a-f]{6})\}([^\n]*?)\{\/color\}/gi,(_,color,s)=>['#005096','#0078b4','#008565','#c62f36','#65717a'].includes(color.toLowerCase())?`<span style="color:${color}">${s}</span>`:escape(`{color:${color}}`)+s+'{/color}');
  return text.replace(/\u0000(\d+)\u0000/g,(_,n)=>saved[Number(n)]??'');
 };
 const lines=String(value).replace(/\r\n?/g,'\n').split('\n'),out=[];let i=0;
 while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
  if(/^```/.test(line)){const code=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;out.push('<pre><code>'+escape(code.join('\n'))+'</code></pre>');continue;}
  if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim()),head=cells(line);i+=2;const rows=[];while(i<lines.length&&lines[i].trim()&&lines[i].includes('|'))rows.push(cells(lines[i++]));out.push('<table><thead><tr>'+head.map(v=>'<th>'+inline(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+head.map((_,n)=>'<td>'+inline(row[n]??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>');continue;}
  const h=line.match(/^(#{1,6})\s+(.+)$/);if(h){out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);i++;continue;}
  if(/^\s*(?:[-*_]\s*){3,}$/.test(line)){out.push('<hr>');i++;continue;}
  const list=line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/);if(list){const ordered=/^\s*\d+[.)]/.test(line),tag=ordered?'ol':'ul',items=[];while(i<lines.length){const m=lines[i].match(ordered?/^\s*\d+[.)]\s+(.+)$/:/^\s*[-+*]\s+(.+)$/);if(!m)break;items.push('<li>'+inline(m[1])+'</li>');i++;}out.push(`<${tag}>${items.join('')}</${tag}>`);continue;}
  if(/^>\s?/.test(line)){const quote=[];while(i<lines.length&&/^>\s?/.test(lines[i]))quote.push(inline(lines[i++].replace(/^>\s?/,'')));out.push('<blockquote>'+quote.join('<br>')+'</blockquote>');continue;}
  const paragraph=[];do{paragraph.push(inline(lines[i++]));}while(i<lines.length&&lines[i].trim()&&!/^(?:#{1,6}\s|```|>\s|\s*(?:[-+*]|\d+[.)])\s)/.test(lines[i]));out.push('<p>'+paragraph.join('<br>')+'</p>');
 }
 return out.join('');
}

// Build only the fixed formatter's elements with DOM APIs. Generated previews
// run under Trusted Types 'none', so even sanitized innerHTML is unavailable.
export function noteMarkdownNodes(root,value){
 const html=noteMarkdownHtml(value),doc=root.ownerDocument,fragment=doc.createDocumentFragment(),stack=[fragment];
 const decode=text=>text.replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name]));
 for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){
  const close=token.match(/^<\/([a-z][a-z0-9]*)>$/i);if(close){if(stack.length>1&&stack[stack.length-1].tagName.toLowerCase()===close[1])stack.pop();continue;}
  const open=token.match(/^<([a-z][a-z0-9]*)([^>]*)>$/i);
  if(open&&['p','h1','h2','h3','h4','h5','h6','strong','em','s','u','code','pre','a','span','br','hr','blockquote','ul','ol','li','table','thead','tbody','tr','th','td'].includes(open[1])){
   const el=doc.createElement(open[1]);if(open[1]==='a'){const href=open[2].match(/href="([^"]+)"/);if(href){el.setAttribute('href',decode(href[1]));el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}}
   if(open[1]==='span'){const color=open[2].match(/style="color:(#[0-9a-f]{6})"/i);if(color)el.style.color=color[1];}
   stack[stack.length-1].append(el);if(!['br','hr'].includes(open[1]))stack.push(el);
  }else stack[stack.length-1].append(doc.createTextNode(decode(token)));
 }
 root.replaceChildren(fragment);
}

// Only the exact retained note and its current-version saved draft may add a
// source to the host's existing click-to-open source panel. Arbitrary HTML stays
// limited to its static sources.
export function noteDraftSource(node,requested,version){
 const html=node?.containerSpec?.type==='html'?node.containerSpec.html:'';
 if(typeof html!=='string'||!/<body\b[^>]*data-sherlock-template="note"/.test(html)||typeof requested!=='string')return null;
 const saved=node.config?.sharedComponentState;if(saved?.version!==version||!validNoteState(saved.state))return null;
 let href,hostname;try{const Url=typeof globalThis.URL==='function'?globalThis.URL:globalThis.window?.URL;const u=new Url(requested);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;href=u.href;hostname=u.hostname}catch{return null}
 for(const match of noteMarkdownHtml(saved.state.content).matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)){
  if(match[1].replace(/&amp;/g,'&')!==href)continue;
  const label=match[2].replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name]));
  return {href,label:label.slice(0,60)||hostname};
 }
 return null;
}

export function noteEditActions(prior,value){
 if(!validNoteContent(prior)||!validNoteContent(value))return null;
 let start=0;while(start<prior.length&&start<value.length&&prior[start]===value[start])start++;
 let end=0;while(end<prior.length-start&&end<value.length-start&&prior[prior.length-1-end]===value[value.length-1-end])end++;
 const insert=value.slice(start,value.length-end),actions=[];let offset=0;
 do{let size=Math.min(1000,insert.length-offset);while(size>0&&new TextEncoder().encode(JSON.stringify(insert.slice(offset,offset+size))).length>3000)size--;
  actions.push({op:'edit',start:start+offset,remove:actions.length?0:prior.length-start-end,insert:insert.slice(offset,offset+size)});offset+=size;
 }while(offset<insert.length);
 return actions.length<=32?actions:null;
}
