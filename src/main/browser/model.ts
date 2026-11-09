import {randomUUID} from 'node:crypto'
import {join,basename,extname} from 'node:path'
import type {BrowserTab,BrowserLink,BrowserSettings} from '../../shared/browser-app'

export function browserAddress(raw:unknown,engine:BrowserSettings['engine']='Google'):string {
 if(typeof raw!=='string'||!raw.trim()||raw.length>8192)throw Error('请输入网址或搜索内容。')
 const text=raw.trim()
 const candidate=/^[a-z][a-z\d+.-]*:/i.test(text)?text:/^[^\s/]+\.[^\s/]+(?:\/.*)?$/.test(text)?'https://'+text:null
 if(!candidate)return ({Google:'https://www.google.com/search?q=',Bing:'https://www.bing.com/search?q=',百度:'https://www.baidu.com/s?wd='}[engine])+encodeURIComponent(text)
 const url=new URL(candidate)
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('只支持不含账号密码的 HTTP(S) 网址。')
 if(/^(localhost\.?$|127\.|0\.|169\.254\.|\[::|\[fe80:)/i.test(url.hostname)||url.hostname.endsWith('.localhost'))throw Error('不能打开客户端本地服务地址。')
 return url.href
}
export function browserDownloadAddress(raw:string,ownerUrl:string){
 if(raw.startsWith('blob:')){const blob=new URL(raw),owner=new URL(browserAddress(ownerUrl));if(blob.origin===owner.origin&&blob.origin!=='null')return blob.href;throw Error('下载来源与当前网页不一致。')}
 return browserAddress(raw)
}
export function availableDownloadPath(directory:string,name:string,reserved:Set<string>,exists:(path:string)=>boolean){
 const filename=basename(name),extension=extname(filename),stem=filename.slice(0,filename.length-extension.length);let i=0,target=join(directory,filename)
 while(exists(target)||reserved.has(target))target=join(directory,stem+' ('+(++i)+')'+extension)
 return target
}
const validLink=(x:any):x is BrowserLink=>{try{return x&&typeof x.id==='string'&&typeof x.title==='string'&&x.title.length<=1024&&Number.isFinite(x.at)&&/^https?:\/\//.test(x.url)&&!!browserAddress(x.url)}catch{return false}}
export class BrowserModel {
 tabs:BrowserTab[]=[];activeId='';history:BrowserLink[]=[];bookmarks:BrowserLink[]=[];folders:string[]=[];closed:(BrowserLink&{pinned?:boolean;muted?:boolean})[]=[]
 settings:BrowserSettings={engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}
 constructor(saved?:any){
  if(!saved||saved.version!==1)return
  if(['Google','Bing','百度'].includes(saved.settings?.engine))this.settings.engine=saved.settings.engine
  if(saved.settings?.startup==='new')this.settings.startup='new'
  if(typeof saved.settings?.bookmarksBar==='boolean')this.settings.bookmarksBar=saved.settings.bookmarksBar
  if(typeof saved.settings?.askDownload==='boolean')this.settings.askDownload=saved.settings.askDownload
  if(typeof saved.settings?.downloadPath==='string')this.settings.downloadPath=saved.settings.downloadPath
  for(const key of ['history','bookmarks','closed'] as const)this[key]=Array.isArray(saved[key])?saved[key].filter(validLink).slice(0,key==='history'?2000:500):[]
  this.folders=Array.isArray(saved.folders)?saved.folders.filter((f:any)=>typeof f==='string'&&f.length<=100).slice(0,100):[]
  if(this.settings.startup==='restore'&&Array.isArray(saved.tabs))for(const row of saved.tabs.slice(0,32)){
   try{const url=row.url?browserAddress(row.url):'';const tab=this.newTab();Object.assign(tab,{url,title:typeof row.title==='string'?row.title.slice(0,1024):'新标签页',pinned:row.pinned===true,muted:row.muted===true,zoom:Math.min(3,Math.max(.25,Number(row.zoom)||1))})}catch{}
  }
  if(Number.isInteger(saved.activeIndex)&&this.tabs[saved.activeIndex])this.activeId=this.tabs[saved.activeIndex]!.id
 }
 newTab(isPrivate=false){
  if(this.tabs.length>=32)throw Error('最多打开 32 个标签页，请先关闭不用的网页。')
  const tab:BrowserTab={id:randomUUID(),url:'',title:'新标签页',private:isPrivate,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}
  this.tabs.push(tab);this.activeId=tab.id;return tab
 }
 tab(id:unknown){const tab=this.tabs.find(t=>t.id===id);if(!tab)throw Error('标签页已关闭。');return tab}
 visited(id:string,url:string,title:string){const tab=this.tab(id);Object.assign(tab,{url,title:title.slice(0,1024)});if(tab.private)return;const last=this.history[0];if(last?.url===url&&Date.now()-last.at<2000){last.title=title;return}this.history.unshift({id:randomUUID(),url,title:title.slice(0,1024),at:Date.now()});this.history.length=Math.min(this.history.length,2000)}
 close(id:string){const tab=this.tab(id),index=this.tabs.indexOf(tab);if(!tab.private)this.closed.unshift({id:randomUUID(),url:tab.url,title:tab.title,at:Date.now(),pinned:tab.pinned,muted:tab.muted});this.closed.length=Math.min(this.closed.length,50);this.tabs.splice(index,1);if(!this.tabs.length)this.newTab();else if(this.activeId===id)this.activeId=this.tabs[Math.min(index,this.tabs.length-1)]!.id;return tab}
 restore(){const row=this.closed[0];if(!row)return null;const tab=this.newTab();this.closed.shift();Object.assign(tab,{url:row.url,title:row.title,pinned:!!row.pinned,muted:!!row.muted});return tab}
 clearHistory(since:number){this.history=this.history.filter(h=>h.at<since);this.closed=this.closed.filter(h=>h.at<since)}
 serialize(){const tabs=this.tabs.filter(t=>!t.private);return {version:1,tabs:tabs.map(({url,title,pinned,muted,zoom})=>({url,title,pinned,muted,zoom})),activeIndex:Math.max(0,tabs.findIndex(t=>t.id===this.activeId)),history:this.history,closed:this.closed.filter(c=>c.url),bookmarks:this.bookmarks,folders:this.folders,settings:this.settings}}
}
