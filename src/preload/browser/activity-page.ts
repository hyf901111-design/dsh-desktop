import type {BrowserDownload,BrowserLink,BrowserSnapshot} from '../../shared/browser-app'
import {browserIcons} from './icons'
import {downloadDetails} from './download-details'
import css from './activity-page.css?inline'

type ActivityPage='history'|'downloads'
type Options={request(method:string,input?:Record<string,unknown>):Promise<any>;openUrl(url:string):void;clearHistory():void;notify(message:string,error?:boolean):void}
type Focus={action:string;id?:string;start?:number|null;end?:number|null;direction?:'forward'|'backward'|'none'|null}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const icon=(name:keyof typeof browserIcons)=>`<i class="eb-activity-icon" aria-hidden="true" style="--eb-activity-icon:url('${browserIcons[name].replaceAll("'",'%27').replaceAll('"','%22')}')"></i>`
const button=(action:string,label:string,extra='',glyph?:keyof typeof browserIcons)=>`<button type="button" data-activity-action="${action}" ${extra}>${glyph?icon(glyph):''}<span>${esc(label)}</span></button>`
const httpUrl=(value:string)=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}}
const host=(url:string)=>{try{return new URL(url).hostname||url}catch{return url}}
const time=(at:number)=>Number.isFinite(at)?new Date(at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'—'
const day=(at:number)=>{
 const date=new Date(at),today=new Date();today.setHours(0,0,0,0)
 if(!Number.isFinite(date.getTime()))return '更早记录'
 const start=new Date(at);start.setHours(0,0,0,0)
 if(start.getTime()===today.getTime())return '今天'
 const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);if(start.getTime()===yesterday.getTime())return '昨天'
 return date.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})
}

/** A persistent full-page library mounted inside an internal browser tab. */
export class BrowserActivityPage {
 readonly root:HTMLElement
 private snapshot?:BrowserSnapshot
 private query=''
 private recent=false
 private limit=200
 private scroll=0
 private focus?:Focus
 private composing=false
 private disposed=false
 private busy=new Set<string>()
 private search:HTMLInputElement
 private list:HTMLElement
 private scroller:HTMLElement
 constructor(private document:Document,readonly page:ActivityPage,private options:Options){
  if(!document.getElementById('browser-activity-page-style')){const style=document.createElement('style');style.id='browser-activity-page-style';style.textContent=css;document.head.append(style)}
  const history=page==='history',title=history?'历史记录':'下载内容'
  this.root=document.createElement('section');this.root.className='eb-activity-page';this.root.dataset.activityPage=page;this.root.setAttribute('aria-label',title)
  this.root.innerHTML=`<div class="eb-activity-inner"><header class="eb-activity-header"><div><h1>${title}</h1><p data-activity-summary></p></div>${history?button('clear','清除浏览数据','', 'trash'):button('directory','打开下载文件夹','','folder')}</header><div class="eb-activity-tools"><label class="eb-activity-search">${icon('search')}<input type="search" data-activity-action="search" aria-label="搜索${title}" placeholder="${history?'搜索标题或网址':'搜索文件名或网址'}" autocomplete="off" spellcheck="false"></label>${history?`<div class="eb-activity-tabs" role="tablist" aria-label="历史记录类型">${button('all','全部记录','role="tab" aria-selected="true"')}${button('recent','最近关闭','role="tab" aria-selected="false"')}</div>`:''}<p class="eb-activity-result" data-activity-count aria-live="polite"></p></div><div class="eb-activity-scroll"><div class="eb-activity-list" aria-label="${title}列表"></div></div></div>`
  this.search=this.root.querySelector('input')!;this.list=this.root.querySelector('.eb-activity-list')!;this.scroller=this.root.querySelector('.eb-activity-scroll')!
  this.root.addEventListener('click',this.click);this.root.addEventListener('input',this.input);this.root.addEventListener('compositionstart',this.compositionStart);this.root.addEventListener('compositionend',this.compositionEnd);this.root.addEventListener('keydown',this.key)
 }
 /** Capture before the browser chrome replaces its markup. Detached instances keep their saved state. */
 preserve():void{
  if(this.disposed||!this.root.isConnected)return
  this.scroll=this.scroller.scrollTop
  const active=this.document.activeElement as HTMLElement|null
  if(!active||!this.root.contains(active)){this.focus=undefined;return}
  const action=active.dataset.activityAction
  this.focus=action?{action,id:active.dataset.activityId}:undefined
  if(active===this.search){this.query=this.search.value;this.focus={action:'search',start:this.search.selectionStart,end:this.search.selectionEnd,direction:this.search.selectionDirection}}
 }
 update(snapshot:BrowserSnapshot):void{
  if(this.disposed)return
  this.preserve();this.snapshot=snapshot;this.render()
 }
 mount(host:HTMLElement):void{
  if(this.disposed)return
  if(this.root.parentElement!==host)host.append(this.root)
  this.scroller.scrollTop=this.scroll;this.restoreFocus()
 }
 focusSearch():void{
  if(this.disposed)return
  this.focus={action:'search'};this.restoreFocus(true)
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true
  this.root.removeEventListener('click',this.click);this.root.removeEventListener('input',this.input);this.root.removeEventListener('compositionstart',this.compositionStart);this.root.removeEventListener('compositionend',this.compositionEnd);this.root.removeEventListener('keydown',this.key);this.root.remove()
 }
 private restoreFocus(explicit=false){
  if(!this.root.isConnected||!this.focus)return
  const active=this.document.activeElement
  if(!explicit&&active&&active!==this.document.body&&active!==this.document.documentElement&&!this.root.contains(active))return
  const saved=this.focus,node=saved.action==='search'?this.search:[...this.root.querySelectorAll<HTMLElement>('[data-activity-action]')].find(el=>el.dataset.activityAction===saved.action&&el.dataset.activityId===saved.id)
  if(!node)return
  if(this.document.activeElement!==node)node.focus({preventScroll:true})
  if(node===this.search&&!this.composing&&saved.start!=null)this.search.setSelectionRange(saved.start,saved.end??saved.start,saved.direction??undefined)
 }
 private historyRows():BrowserLink[]{
  const rows=this.recent?(this.snapshot?.closed??[]).filter(row=>!!httpUrl(row.url)):(this.snapshot?.history??[])
  const query=this.query.trim().toLocaleLowerCase()
  return rows.filter(row=>!query||[row.title,row.url].some(value=>value.toLocaleLowerCase().includes(query))).slice().sort((a,b)=>b.at-a.at)
 }
 private downloadRows():BrowserDownload[]{const query=this.query.trim().toLocaleLowerCase();return(this.snapshot?.downloads??[]).filter(row=>!query||[row.name,row.url].some(value=>value.toLocaleLowerCase().includes(query)))}
 private render(){
  if(!this.snapshot)return
  const history=this.page==='history',query=!!this.query.trim()
  this.root.querySelector('[data-activity-summary]')!.textContent=history?`${this.snapshot.history.length} 条浏览记录`:`${this.snapshot.downloads.length} 项下载${this.snapshot.downloads.some(d=>d.state==='progressing'||d.state==='paused')?` · ${this.snapshot.downloads.filter(d=>d.state==='progressing'||d.state==='paused').length} 项进行中`:''}`
  if(history){
   for(const node of this.root.querySelectorAll<HTMLElement>('[role="tab"]')){const current=(node.dataset.activityAction==='recent')===this.recent;node.setAttribute('aria-selected',String(current));node.tabIndex=current?0:-1}
   const rows=this.historyRows(),shown=query?rows:rows.slice(0,this.limit)
   this.root.querySelector('[data-activity-count]')!.textContent=query?`找到 ${rows.length} 条记录`:`${this.recent?'最近关闭':'全部记录'} · ${rows.length} 条${shown.length<rows.length?` · 已显示 ${shown.length} 条`:''}`
   let previous=''
   this.list.innerHTML=rows.length?shown.map(row=>{const date=day(row.at),heading=date!==previous?`<h2 class="eb-activity-date">${esc(date)}</h2>`:'';previous=date;return heading+this.historyRow(row)}).join('')+(shown.length<rows.length?`<div class="eb-activity-more">${button('more','显示更多')}<span>还有 ${rows.length-shown.length} 条记录</span></div>`:''):this.empty(query?'没有找到匹配的历史记录':this.recent?'还没有最近关闭的网页':'还没有历史记录',query?'换一个标题或网址试试。':this.recent?'关闭的网页会显示在这里。':'开始浏览后，访问过的网页会显示在这里。','history')
  }else{
   const rows=this.downloadRows();this.root.querySelector('[data-activity-count]')!.textContent=query?`找到 ${rows.length} 项下载`:`全部下载 · ${rows.length} 项`
   this.list.innerHTML=rows.length?rows.map(row=>this.downloadRow(row)).join(''):this.empty(query?'没有找到匹配的下载内容':'还没有下载内容',query?'换一个文件名或网址试试。':'下载的文件会显示在这里。','download')
  }
  this.scroller.scrollTop=this.scroll;this.restoreFocus()
 }
 private empty(title:string,copy:string,glyph:'history'|'download'){return `<div class="eb-activity-empty">${icon(glyph)}<h2>${esc(title)}</h2><p>${esc(copy)}</p>${this.query.trim()?button('clear-search','清空搜索'):''}</div>`}
 private historyRow(row:BrowserLink){
  const title=row.title||host(row.url)||row.url,id=`data-activity-id="${esc(row.id)}"`,busy=this.busy.has(row.id)
  return `<article class="eb-activity-history-row" data-activity-row="${esc(row.id)}"><time>${esc(time(row.at))}</time><button type="button" class="eb-activity-open" data-activity-action="open-history" ${id} aria-label="打开 ${esc(title)}" ${!httpUrl(row.url)?'disabled':''}>${icon('globe')}<span class="eb-activity-copy"><strong>${esc(title)}</strong><small title="${esc(row.url)}">${esc(row.url)}</small></span></button>${!this.recent?button('remove-history','删除',`${id} aria-label="删除 ${esc(title)}" ${busy?'disabled':''}`,'trash'):''}</article>`
 }
 private downloadRow(row:BrowserDownload){
  const {active,total,received,detail,commands}=downloadDetails(row)
  const id=`data-activity-id="${esc(row.id)}"`,action=(value:string,label:string,glyph?:keyof typeof browserIcons)=>button('download-'+value,label,`${id} ${this.busy.has(row.id)?'disabled':''}`,glyph)
  const actions=commands.map(([value,label,glyph])=>action(value,label,glyph)).join('')
  return `<article class="eb-activity-download-row" data-activity-row="${esc(row.id)}" data-state="${esc(row.state)}"><div class="eb-activity-file-icon">${icon('file')}</div><div class="eb-activity-download-copy"><strong class="eb-activity-filename" title="${esc(row.name)}">${esc(row.name||'未命名文件')}</strong><p class="eb-activity-status">${esc(detail)}</p><button type="button" class="eb-activity-source" data-activity-action="open-source" ${id} aria-label="打开来源 ${esc(row.name)}" title="${esc(row.url)}" ${!httpUrl(row.url)?'disabled':''}>${esc(host(row.url))}${icon('external')}</button>${active?`<progress aria-label="${esc(row.name)}下载进度" max="${total||1}" ${total?`value="${Math.min(received,total)}"`:''}></progress>`:''}<div class="eb-activity-download-actions">${actions}</div></div></article>`
 }
 private input=(event:Event)=>{
  if(event.target!==this.search)return
  this.query=this.search.value;this.limit=200;this.scroll=0;if(!this.composing){this.preserve();this.scroll=0;this.render()}
 }
 private compositionStart=(event:Event)=>{if(event.target===this.search)this.composing=true}
 private compositionEnd=(event:Event)=>{if(event.target===this.search){this.composing=false;this.input(event)}}
 private key=(event:KeyboardEvent)=>{
  const node=event.target as HTMLElement
  if(node.getAttribute('role')!=='tab'||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault();this.recent=event.key==='End'||(event.key!=='Home'&&!this.recent);this.limit=200;this.scroll=0;this.focus={action:this.recent?'recent':'all'};this.render()
 }
 private click=(event:Event)=>{
  const node=(event.target as Element).closest<HTMLElement>('[data-activity-action]');if(!node||!this.root.contains(node))return
  const action=node.dataset.activityAction,id=node.dataset.activityId
  if(action==='clear'){this.options.clearHistory();return}
  if(action==='all'||action==='recent'){this.preserve();this.recent=action==='recent';this.limit=200;this.scroll=0;this.render();return}
  if(action==='more'){this.preserve();this.limit+=200;this.render();return}
  if(action==='clear-search'){this.query='';this.search.value='';this.limit=200;this.scroll=0;this.focus={action:'search'};this.render();return}
  if(action==='open-history'||action==='open-source'){
   const row=action==='open-history'?this.historyRows().find(row=>row.id===id):this.snapshot?.downloads.find(row=>row.id===id),url=row&&httpUrl(row.url)
   if(url)this.options.openUrl(url);return
  }
  if(action==='directory'){void this.run('download',{action:'directory'},'directory');return}
  if(!id||this.busy.has(id))return
  if(action==='remove-history'){void this.run('history-remove',{id},id);return}
  if(action?.startsWith('download-'))void this.run('download',{id,action:action.slice(9)},id)
 }
 private async run(method:string,input:Record<string,unknown>,key:string){
  if(this.busy.has(key))return
  this.preserve();this.busy.add(key);this.render()
  try{
   const result=await this.options.request(method,input)
   if(this.disposed)return
   if(result&&Array.isArray(result.history)&&Array.isArray(result.downloads))this.update(result)
   if(method==='download'&&input.action==='material')this.options.notify('下载文件已加入工作材料。')
  }catch(error){if(!this.disposed)this.options.notify(error instanceof Error?error.message:'操作失败，请重试。',true)}
  finally{this.busy.delete(key);if(!this.disposed){this.preserve();this.render()}}
 }
}
