import type {BrowserLink,BrowserSnapshot} from '../../shared/browser-app'
import {browserIcons} from './icons'
import css from './bookmark-manager.css?inline'

type Options={request(method:string,input?:Record<string,unknown>):Promise<any>;openUrl(url:string):void;close():void;notify(message:string,error?:boolean):void}
type Draft={kind:'bookmark';id?:string;title:string;url:string;folder:string}|{kind:'folder';previous?:string;name:string}|{kind:'remove';ids:string[]}|{kind:'remove-folder';name:string}|{kind:'move';folder:string}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const icon=(name:keyof typeof browserIcons,className='')=>`<i class="eb-bm-icon ${className}" aria-hidden="true" style="--eb-bm-icon:url('${browserIcons[name].replaceAll("'",'%27').replaceAll('"','%22')}')"></i>`
const button=(action:string,label:string,extra='',className='')=>`<button type="button" data-bm-action="${action}" class="${className}" ${extra}>${esc(label)}</button>`

/** Full-page bookmark library. All event attributes are isolated from BrowserAppView. */
export class BrowserBookmarkManager {
 readonly root:HTMLElement
 private snapshot?:BrowserSnapshot
 private folder:string|null=null
 private query=''
 private selected=new Set<string>()
 private draft?:Draft
 private error=''
 private busy=false
 private disposed=false
 private returnFocus?:HTMLElement
 constructor(private document:Document,private options:Options){
  if(!document.getElementById('browser-bookmark-manager-style')){const style=document.createElement('style');style.id='browser-bookmark-manager-style';style.textContent=css;document.head.append(style)}
  this.root=document.createElement('section');this.root.className='eb-bookmark-manager';this.root.setAttribute('aria-label','管理收藏')
  this.root.innerHTML=`<header class="eb-bm-header"><div><h1>管理收藏</h1><p data-bm-summary>整理网址，让有用的资料随手可得。</p></div><div class="eb-bm-header-actions">${button('close','返回浏览器')}${button('new-bookmark','新增收藏','','eb-bm-primary')}</div></header><div class="eb-bm-body"><nav class="eb-bm-sidebar" aria-label="收藏文件夹"></nav><main class="eb-bm-main"><div class="eb-bm-tools"><label class="eb-bm-search">${icon('search')}<input type="search" data-bm-field="search" aria-label="搜索收藏" placeholder="搜索名称、网址或文件夹"></label></div><div class="eb-bm-list-heading"></div><div class="eb-bm-batch" aria-live="polite"></div><div class="eb-bm-list" aria-label="收藏列表"></div></main></div><div class="eb-bm-editor-host"></div>`
  this.root.addEventListener('click',this.click);this.root.addEventListener('input',this.input);this.root.addEventListener('change',this.change);this.root.addEventListener('submit',this.submit);this.root.addEventListener('keydown',this.key)
 }
 update(snapshot:BrowserSnapshot){
  if(this.disposed)return
  this.snapshot=snapshot
  const ids=new Set(snapshot.bookmarks.map(b=>b.id));for(const id of this.selected)if(!ids.has(id))this.selected.delete(id)
  if(this.folder&&!this.folders().includes(this.folder))this.folder=null
  this.render()
 }
 dispose(){
  if(this.disposed)return;this.disposed=true
  this.root.removeEventListener('click',this.click);this.root.removeEventListener('input',this.input);this.root.removeEventListener('change',this.change);this.root.removeEventListener('submit',this.submit);this.root.removeEventListener('keydown',this.key);this.root.remove()
 }
 private slot(name:string){return this.root.querySelector<HTMLElement>('.eb-bm-'+name)!}
 private folders(){return [...new Set([...(this.snapshot?.folders??[]),...(this.snapshot?.bookmarks.map(b=>b.folder||'')??[])])].filter(Boolean)}
 private rows(){const query=this.query.trim().toLocaleLowerCase();return(this.snapshot?.bookmarks??[]).filter(b=>(this.folder===null||(b.folder||'')===this.folder)&&(!query||[b.title,b.url,b.folder].some(value=>value?.toLocaleLowerCase().includes(query))))}
 private render(){
  if(!this.snapshot)return
  const active=this.document.activeElement as HTMLInputElement|null,field=active?.dataset.bmField,action=active?.dataset.bmAction,id=active?.dataset.bmId,focusFolder=active?.dataset.bmFolder,focusAll=active?.dataset.bmAll
  const range=active&&['text','search','url'].includes(active.type)?[active.selectionStart,active.selectionEnd] as const:undefined
  const list=this.slot('list'),scroll=list.scrollTop,sidebar=this.slot('sidebar'),sideScroll=sidebar.scrollTop,rows=this.rows(),bookmarks=this.snapshot.bookmarks
  this.root.querySelector('[data-bm-summary]')!.textContent=`${bookmarks.length} 项收藏 · ${this.folders().length} 个文件夹`
  const folderButton=(name:string|null,label:string,count:number)=>`<button type="button" data-bm-action="filter" data-bm-all="${name===null}" data-bm-folder="${esc(name)}" aria-label="${esc(label)}" ${this.folder===name?'aria-current="page"':''}>${icon(name===null?'book':name?'folder':'starOutline','eb-bm-folder-icon')}<span class="eb-bm-folder-name">${esc(label)}</span><small>${count}</small></button>`
  sidebar.innerHTML=folderButton(null,'全部收藏',bookmarks.length)+folderButton('','未分类',bookmarks.filter(b=>!b.folder).length)+`<div class="eb-bm-sidebar-label">文件夹</div>`+this.folders().map(name=>folderButton(name,name,bookmarks.filter(b=>b.folder===name).length)).join('')+button('new-folder','新建文件夹','','eb-bm-new-folder')
  const countSelected=rows.filter(b=>this.selected.has(b.id)).length,all=rows.length>0&&countSelected===rows.length
  this.slot('list-heading').innerHTML=`<label class="eb-bm-check-all"><input type="checkbox" data-bm-action="select-all" aria-label="选择当前列表全部收藏" ${all?'checked':''} ${!rows.length?'disabled':''}><h2>${esc(this.folder===null?'全部收藏':this.folder||'未分类')}</h2><span>${rows.length} 项${this.query?'搜索结果':''}</span></label>${this.folder?`<div class="eb-bm-folder-actions">${button('rename-folder','重命名文件夹')}${button('remove-folder','移除文件夹')}</div>`:''}`
  this.slot('list-heading').querySelector<HTMLInputElement>('input')!.indeterminate=countSelected>0&&!all
  const batch=this.slot('batch');batch.hidden=!this.selected.size;batch.innerHTML=`<span>已选择 ${this.selected.size} 项</span><div>${button('move','移动所选')}${button('remove-selected','删除所选','','eb-bm-danger')}${button('clear-selection','取消选择')}</div>`
  list.innerHTML=rows.length?rows.map(b=>`<article class="eb-bm-row" data-bm-row="${esc(b.id)}" ${this.selected.has(b.id)?'data-selected="true"':''}><input type="checkbox" data-bm-action="select" data-bm-id="${esc(b.id)}" aria-label="选择 ${esc(b.title)}" ${this.selected.has(b.id)?'checked':''}><button type="button" class="eb-bm-open" data-bm-action="open" data-bm-id="${esc(b.id)}" aria-label="打开 ${esc(b.title)}">${icon('globe','eb-bm-link-icon')}<span class="eb-bm-link-copy"><strong>${esc(b.title||b.url)}</strong><small>${esc(b.url)}</small></span></button><span class="eb-bm-row-folder" title="${esc(b.folder||'未分类')}">${esc(b.folder||'未分类')}</span><div class="eb-bm-row-actions">${button('edit','编辑',`data-bm-id="${esc(b.id)}" aria-label="编辑 ${esc(b.title)}"`)}${button('remove','删除',`data-bm-id="${esc(b.id)}" aria-label="删除 ${esc(b.title)}"`,'eb-bm-danger')}</div></article>`).join(''):`<div class="eb-bm-empty">${icon('starOutline')}<h3>${this.query?'没有找到匹配的收藏':'这里还没有收藏'}</h3><p>${this.query?'换一个名称、网址或文件夹试试。':'添加常用网址，或把已有收藏移动到这里。'}</p>${!this.query?button('new-bookmark','添加第一个收藏'):button('clear-search','清空搜索')}</div>`
  list.scrollTop=scroll;sidebar.scrollTop=sideScroll
  this.renderEditor()
  this.root.dataset.busy=String(this.busy)
  for(const el of this.root.querySelectorAll<HTMLInputElement>('button,input,select'))el.disabled=this.busy||(el.dataset.bmAction==='select-all'&&!rows.length)
  if(active&&this.root.contains(active))return
  let restore:HTMLElement|undefined
  if(field)restore=[...this.root.querySelectorAll<HTMLElement>('[data-bm-field]')].find(el=>el.dataset.bmField===field)
  else if(action)restore=[...this.root.querySelectorAll<HTMLElement>('[data-bm-action]')].find(el=>el.dataset.bmAction===action&&el.dataset.bmId===id&&el.dataset.bmFolder===focusFolder&&el.dataset.bmAll===focusAll)
  restore?.focus({preventScroll:true});if(restore&&range&&range[0]!==null)(restore as HTMLInputElement).setSelectionRange(range[0],range[1])
 }
 private folderOptions(selected:string){return `<option value="">未分类</option>`+this.folders().map(folder=>`<option value="${esc(folder)}" ${folder===selected?'selected':''}>${esc(folder)}</option>`).join('')+(selected&&!this.folders().includes(selected)?`<option value="${esc(selected)}" selected>${esc(selected)}（已移除）</option>`:'')}
 private renderEditor(){
  const host=this.slot('editor-host'),draft=this.draft;if(!draft){host.innerHTML='';return}
  let title='',body='',submit='保存',danger=false
  if(draft.kind==='bookmark'){
   title=draft.id?'编辑收藏':'新增收藏';body=`<label>收藏名称<input type="text" data-bm-field="title" aria-label="收藏名称" maxlength="1024" value="${esc(draft.title)}" placeholder="为网址起个容易找到的名称"></label><label>收藏网址<input type="text" data-bm-field="url" aria-label="收藏网址" maxlength="8192" required value="${esc(draft.url)}" placeholder="https://example.com" inputmode="url" spellcheck="false"></label><label>所属文件夹<select data-bm-field="folder" aria-label="所属文件夹">${this.folderOptions(draft.folder)}</select></label>`
  }else if(draft.kind==='folder'){
   title=draft.previous?'重命名文件夹':'新建文件夹';submit=draft.previous?'保存':'创建';body=`<label>文件夹名称<input type="text" data-bm-field="name" aria-label="文件夹名称" maxlength="100" value="${esc(draft.name)}" required placeholder="例如：研究资料"></label>`
  }else if(draft.kind==='move'){
   title=`移动 ${this.selected.size} 项收藏`;submit='移动';body=`<label>目标文件夹<select data-bm-field="folder" aria-label="目标文件夹">${this.folderOptions(draft.folder)}</select></label>`
  }else if(draft.kind==='remove-folder'){
   title='移除文件夹';submit='移除文件夹';danger=true;body=`<p>移除“${esc(draft.name)}”文件夹后，其中的收藏会保留在“未分类”。</p>`
  }else{
   title='删除收藏';submit=`删除 ${draft.ids.length} 项收藏`;danger=true;body=`<p>确认删除所选的 ${draft.ids.length} 项收藏？此操作无法撤销。</p>`
  }
  host.innerHTML=`<div class="eb-bm-scrim"><section class="eb-bm-dialog" role="dialog" aria-modal="true" aria-labelledby="eb-bm-dialog-title"><form><h2 id="eb-bm-dialog-title">${esc(title)}</h2><div class="eb-bm-dialog-fields">${body}</div>${this.error?`<p class="eb-bm-error" role="alert">${esc(this.error)}</p>`:''}<footer>${button('cancel','取消')}<button type="submit" class="${danger?'eb-bm-destructive':'eb-bm-primary'}">${this.busy?'处理中…':esc(submit)}</button></footer></form></section></div>`
 }
 private show(draft:Draft){this.returnFocus=this.document.activeElement as HTMLElement;this.draft=draft;this.error='';this.render();this.slot('editor-host').querySelector<HTMLElement>('input,select,button')?.focus()}
 private dismiss(){if(this.busy)return;this.draft=undefined;this.error='';this.render();if(this.returnFocus?.isConnected)this.returnFocus.focus();else this.root.querySelector<HTMLElement>('[data-bm-action="new-bookmark"]')?.focus()}
 private bookmark(id:string|undefined){return this.snapshot?.bookmarks.find(b=>b.id===id)}
 private click=(event:Event)=>{
  const target=(event.target as Element).closest<HTMLElement>('[data-bm-action]');if(!target||!this.root.contains(target))return
  const action=target.dataset.bmAction,id=target.dataset.bmId
  if(this.busy)return
  if(action==='close')this.options.close()
  if(action==='filter'){this.folder=target.dataset.bmAll==='true'?null:target.dataset.bmFolder||'';this.selected.clear();this.render()}
  if(action==='new-bookmark')this.show({kind:'bookmark',title:'',url:'',folder:this.folder||''})
  if(action==='new-folder')this.show({kind:'folder',name:''})
  if(action==='rename-folder'&&this.folder)this.show({kind:'folder',previous:this.folder,name:this.folder})
  if(action==='remove-folder'&&this.folder)this.show({kind:'remove-folder',name:this.folder})
  if(action==='edit'){const row=this.bookmark(id);if(row)this.show({kind:'bookmark',id:row.id,title:row.title,url:row.url,folder:row.folder||''})}
  if(action==='open'){const row=this.bookmark(id);if(row)this.options.openUrl(row.url)}
  if(action==='remove'&&id)this.show({kind:'remove',ids:[id]})
  if(action==='remove-selected'&&this.selected.size)this.show({kind:'remove',ids:[...this.selected]})
  if(action==='move'&&this.selected.size)this.show({kind:'move',folder:this.folder||''})
  if(action==='clear-selection'){this.selected.clear();this.render()}
  if(action==='clear-search'){this.query='';this.root.querySelector<HTMLInputElement>('[data-bm-field="search"]')!.value='';this.render()}
  if(action==='cancel')this.dismiss()
 }
 private input=(event:Event)=>{
  const target=event.target as HTMLInputElement,field=target.dataset.bmField
  if(field==='search'){this.query=target.value;this.render();return}
  if(!this.draft||!field)return
  if(this.draft.kind==='bookmark'&&['title','url','folder'].includes(field))Object.assign(this.draft,{[field]:target.value})
  if(this.draft.kind==='folder'&&field==='name')this.draft.name=target.value
  if(this.draft.kind==='move'&&field==='folder')this.draft.folder=target.value
 }
 private change=(event:Event)=>{
  const target=event.target as HTMLInputElement
  if(target.dataset.bmField){this.input(event);return}
  if(target.dataset.bmAction==='select'&&target.dataset.bmId){if(target.checked)this.selected.add(target.dataset.bmId);else this.selected.delete(target.dataset.bmId);this.render()}
  if(target.dataset.bmAction==='select-all'){for(const row of this.rows())if(target.checked)this.selected.add(row.id);else this.selected.delete(row.id);this.render()}
 }
 private submit=(event:Event)=>{event.preventDefault();event.stopPropagation();if(!this.busy&&this.draft)void this.save()}
 private async request(method:string,input:Record<string,unknown>){const state=await this.options.request(method,input);if(state&&Array.isArray(state.bookmarks)&&Array.isArray(state.folders))this.update(state);return state}
 private async save(){
  const draft=this.draft;if(!draft)return
  this.busy=true;this.error='';this.render();let message='收藏已更新。',moved=0
  try{
   if(draft.kind==='bookmark'){
    if(!draft.url.trim())throw Error('请输入收藏网址。')
    await this.request(draft.id?'bookmark-update':'bookmark',{...(draft.id?{id:draft.id}:{}),url:draft.url.trim(),title:draft.title.trim(),folder:draft.folder});message=draft.id?'收藏已更新。':'收藏已添加。'
   }else if(draft.kind==='folder'){
    const name=draft.name.trim();if(!name)throw Error('请输入文件夹名称。')
    if(draft.previous===name){this.draft=undefined;return}
    await this.request(draft.previous?'folder-rename':'folder',{...(draft.previous?{previous:draft.previous}:{}),name});this.folder=name;message=draft.previous?'文件夹已重命名。':'文件夹已创建。'
   }else if(draft.kind==='remove-folder'){
    await this.request('folder-remove',{name:draft.name});if(this.folder===draft.name)this.folder=null;message='文件夹已移除，收藏已保留在未分类。'
   }else if(draft.kind==='remove'){
    await this.request('bookmarks-remove',{ids:draft.ids});for(const id of draft.ids)this.selected.delete(id);message=`已删除 ${draft.ids.length} 项收藏。`
   }else{
    const rows=[...this.selected].map(id=>this.bookmark(id)).filter((b):b is BrowserLink=>!!b)
    for(const row of rows){await this.request('bookmark-update',{id:row.id,url:row.url,title:row.title,folder:draft.folder});moved++}
    this.selected.clear();message=`已移动 ${moved} 项收藏。`
   }
   this.draft=undefined;this.options.notify(message)
  }catch(error){this.error=(moved?`已有 ${moved} 项移动成功。`:'')+(error instanceof Error?error.message:'操作失败，请重试。')}
  finally{this.busy=false;if(!this.disposed){this.render();if(this.draft)this.slot('editor-host').querySelector<HTMLElement>('[role="alert"]')?.setAttribute('tabindex','-1');else this.root.querySelector<HTMLElement>('[data-bm-action="new-bookmark"]')?.focus({preventScroll:true})}}
 }
 private key=(event:KeyboardEvent)=>{
  if(!this.draft)return
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.dismiss();return}
  if(event.key==='Tab'){
   const nodes=[...this.slot('editor-host').querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)')],first=nodes[0],last=nodes.at(-1)
   if(event.shiftKey&&this.document.activeElement===first){event.preventDefault();last?.focus()}
   else if(!event.shiftKey&&this.document.activeElement===last){event.preventDefault();first?.focus()}
  }
 }
}
