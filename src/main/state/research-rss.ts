import {randomUUID,createHash} from 'node:crypto'
import {lookup} from 'node:dns/promises'
import {isIP,BlockList} from 'node:net'
import {request as httpsRequest} from 'node:https'
import {request as httpRequest,type IncomingHttpHeaders} from 'node:http'
import {DOMParser,type Element} from '@xmldom/xmldom'
import {rssDataIssue,rssUrl,type RssSpec} from '../../../packages/dsh-research-task-runtime/rss-template-contract.js'
import {readTemplateModel} from '../../../packages/dsh-research-task-runtime/component-template-registry.js'
import {acceptArtifactOutput} from '../../../packages/dsh-research-task-runtime/artifact-output.js'
import type {CanvasActionBridge} from './canvas-action-bridge'
import {registerTrustedMainWindowHandler,type TrustedWindow} from '../ipc-trust'

const MAX_FEED_BYTES=512000
export const DEFAULT_RSS_URL='https://www.federalreserve.gov/feeds/press_all.xml'
const blocked=new BlockList()
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(address,prefix,'ipv4')
const globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6')
for(const [address,prefix] of [['2001::',32],['2001:db8::',32],['2002::',16]] as const)blocked.addSubnet(address,prefix,'ipv6')
export function isPublicRssAddress(address:string){const family=isIP(address);return family===4?!blocked.check(address,'ipv4'):family===6&&globalV6.check(address,'ipv6')&&!blocked.check(address,'ipv6')}
function publicUrl(value:unknown):string{const normalized=rssUrl(value);if(!normalized)throw Error('订阅地址需不带登录信息的 http 或 https URL');const u=new URL(normalized),host=u.hostname.replace(/^\[|\]$/g,'');if(u.port||host==='localhost'||host.endsWith('.localhost')||isIP(host)&&!isPublicRssAddress(host))throw Error('只允许公开网站的标准端口订阅');u.hash='';return u.href}
const children=(node:Element,name:string,ns:string|null=null)=>Array.from(node.childNodes).filter((n):n is Element=>n.nodeType===1&&n.localName===name&&(ns===null||n.namespaceURI===ns))
const text=(node:Element,name:string,ns:string|null=null)=>children(node,name,ns)[0]?.textContent??''
function resolvedLink(value:string,base:string):string|null{if(!value.trim())return null;try{return rssUrl(new URL(value.trim(),base).href)}catch{return null}}
export function parseRssFeed(xml:string,url:string,id:string,fetchedAt:string){
 if(Buffer.byteLength(xml)>MAX_FEED_BYTES||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw Error('订阅源过大或含不支持的 XML 声明')
 const doc=new DOMParser({onError:()=>{throw Error('订阅源 XML 格式无效')}}).parseFromString(xml,'application/xml'),root=doc.documentElement
 if(!root)throw Error('订阅源无内容')
 let format:'rss'|'atom',title:string,items:Element[],ns:string|null=null,base=url
 if(root.localName==='rss'){const channel=children(root,'channel')[0];if(!channel)throw Error('RSS 缺少 channel');format='rss';title=text(channel,'title');items=children(channel,'item')}
 else if(root.localName==='feed'&&root.namespaceURI==='http://www.w3.org/2005/Atom'){format='atom';ns=root.namespaceURI;title=text(root,'title',ns);items=children(root,'entry',ns);const rootBase=root.getAttributeNS('http://www.w3.org/XML/1998/namespace','base');if(rootBase)base=new URL(rootBase,url).href}
 else throw Error('地址没有返回 RSS 2.0 或 Atom 订阅源')
 if(items.length>100)throw Error('来源超过100条，未截断；请选择较小的订阅源')
 const entries=items.map(item=>{
  let link:string|null=null,itemBase=base;const rawBase=item.getAttributeNS('http://www.w3.org/XML/1998/namespace','base');if(rawBase)itemBase=new URL(rawBase,base).href
  if(format==='rss')link=resolvedLink(text(item,'link'),itemBase)
  else{const alternate=children(item,'link',ns).find(l=>!l.getAttribute('rel')||l.getAttribute('rel')==='alternate');if(alternate)link=resolvedLink(alternate.getAttribute('href')??'',itemBase)}
  const originalId=text(item,format==='rss'?'guid':'id',ns),entryTitle=text(item,'title',ns),summary=text(item,format==='rss'?'description':'summary',ns)||text(item,format==='rss'?'encoded':'content',ns),published=text(item,format==='rss'?'pubDate':'published',ns).trim()||null,updated=format==='atom'?text(item,'updated',ns).trim()||null:null
  return {id:originalId||link||'derived:'+createHash('sha256').update(JSON.stringify([entryTitle,summary,published,updated])).digest('hex'),title:entryTitle,url:link,summary,publishedAt:published,updatedAt:updated}
 })
 const feed={id,url,title,format,fetchedAt,error:null,entries},issue=rssDataIssue({version:1,type:'rss',title:'订阅',asOf:'实际读取的订阅源',feeds:[feed]})
 if(issue)throw Error(issue)
 return feed
}
type Address={address:string;family:number}
type FeedResponse={status:number;headers:IncomingHttpHeaders;body:Buffer}
type Dependencies={lookup?(host:string):Promise<Address[]>;request?(url:URL,addresses:Address[],signal:AbortSignal):Promise<FeedResponse>;now?():string;signal?:AbortSignal}
function pinnedRequest(url:URL,addresses:Address[],signal:AbortSignal):Promise<FeedResponse>{
 return new Promise((resolve,reject)=>{
  const request=url.protocol==='https:'?httpsRequest:httpRequest
  const req=request(url,{method:'GET',agent:false,signal,headers:{Accept:'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9','Accept-Encoding':'identity','User-Agent':'EWork-Odyssey-RSS/1.0'},lookup:((_host:any,options:any,callback:any)=>{if(options?.all)callback(null,addresses);else callback(null,addresses[0]!.address,addresses[0]!.family)}) as any},response=>{
   const size=Number(response.headers['content-length']);if(Number.isFinite(size)&&size>MAX_FEED_BYTES){response.destroy();reject(Error('订阅源超过512KB，已有内容保留'));return}
   const chunks:Buffer[]=[];let bytes=0
   response.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_FEED_BYTES){response.destroy();reject(Error('订阅源超过512KB，已有内容保留'))}else chunks.push(Buffer.from(chunk))})
   response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode??0,headers:response.headers,body:Buffer.concat(chunks)}))
  });req.on('error',reject);req.end()
 })
}
function withAbort<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{const aborted=()=>reject(signal.reason);if(signal.aborted){aborted();return}signal.addEventListener('abort',aborted,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted))})
}
export async function readPublicRssFeed(raw:string,id:string,dependencies:Dependencies={}){
 let current=publicUrl(raw);const original=current,signal=dependencies.signal??AbortSignal.timeout(15000)
 for(let redirects=0;redirects<=3;redirects++){
  const url=new URL(current),host=url.hostname.replace(/^\[|\]$/g,''),addresses=isIP(host)?[{address:host,family:isIP(host)}]:await withAbort((dependencies.lookup??(h=>lookup(h,{all:true,verbatim:true})))(host),signal)
  signal.throwIfAborted();if(!addresses.length||!addresses.every(a=>isPublicRssAddress(a.address)))throw Error('订阅地址解析到非公开网络，未读取')
  const response=await withAbort((dependencies.request??pinnedRequest)(url,addresses,signal),signal)
  if(response.status>=300&&response.status<400){if(redirects===3||!response.headers.location)throw Error('订阅源重定向不可用');current=publicUrl(new URL(response.headers.location,current).href);continue}
  if(response.status!==200)throw Error('订阅源返回 HTTP '+response.status+'，已有内容保留')
  if(response.body.length>MAX_FEED_BYTES)throw Error('订阅源超过512KB，已有内容保留')
  if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')throw Error('订阅源返回不支持的压缩内容')
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(response.body)
  return {...parseRssFeed(xml,current,id,dependencies.now?.()??new Date().toISOString()),url:original}
 }
 throw Error('订阅源重定向不可用')
}
export function createResearchRssService(options:{canvas:CanvasActionBridge;isShared(id:string):boolean;readFeed?:typeof readPublicRssFeed}){
 const active=new Set<string>()
 async function request(value:any){
  const allowed=['sessionId','nodeId','action','url','feedId'];if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k))||![value.sessionId,value.nodeId].every(v=>typeof v==='string'&&v.length>0&&v.length<=256)||!['add','defaults','refresh','remove'].includes(value.action))throw Error('订阅操作无效')
  if(options.isShared(value.sessionId))throw Error('共享画布仅浏览订阅快照')
  if(value.action==='add'?(typeof value.url!=='string'||value.feedId!==undefined):value.url!==undefined||value.feedId!==undefined&&(typeof value.feedId!=='string'||value.feedId.length>1024))throw Error('订阅操作字段无效')
  if(value.action==='remove'&&!value.feedId)throw Error('请选择要移除的订阅源')
  const key=value.sessionId+':'+value.nodeId;if(active.has(key))throw Error('此组件正在读取订阅，请稍后再试')
  active.add(key)
  try{
   options.canvas.bind({sessionId:value.sessionId,selectedIds:[value.nodeId]})
   const inspect=await options.canvas.execute({sessionId:value.sessionId,method:'inspect',args:{ids:[value.nodeId]}}) as any
   const node=inspect.nodes.find((n:any)=>n.id===value.nodeId),model=readTemplateModel(node?.content?.containerSpec)
   if(!inspect.writable||!node?.capabilities?.fields?.containerSpec||model?.templateId!=='rss'||rssDataIssue(model.data))throw Error('当前组件不是可编辑的 RSS 订阅')
   const data=structuredClone(model.data as RssSpec),feeds=data.feeds
   if(value.action==='remove'){const index=feeds.findIndex((f:any)=>f.id===value.feedId);if(index<0)throw Error('订阅源已变化');feeds.splice(index,1)}
   else{
    if(value.action==='add'||value.action==='defaults'){const url=publicUrl(value.action==='defaults'?DEFAULT_RSS_URL:value.url);if(feeds.some((f:any)=>rssUrl(f.url)===url))throw Error('此订阅源已经存在');if(feeds.length>=10)throw Error('一个组件最多10个订阅源');feeds.push({id:randomUUID(),url,title:new URL(url).hostname,format:'unknown',fetchedAt:null,error:'尚未读取',entries:[]})}
    const targets=value.action==='add'||value.action==='defaults'?[feeds.at(-1)]:feeds.filter((f:any)=>!value.feedId||f.id===value.feedId)
    if(!targets.length)throw Error('没有可刷新的订阅源')
    for(const f of targets){if(!f)continue;try{Object.assign(f,await (options.readFeed??readPublicRssFeed)(f.url,f.id))}catch(error:any){f.error=error?.name==='TimeoutError'||error?.name==='AbortError'?'读取超时，已有内容保留':String(error?.message??'读取失败，已有内容保留').slice(0,1000)}}
   }
   const issue=rssDataIssue(data);if(issue)throw Error(issue)
   const output=acceptArtifactOutput(JSON.stringify(data));if(!output)throw Error('完整订阅内容超过显示容量，已有内容保留')
   await options.canvas.execute({sessionId:value.sessionId,method:'apply',source:'component-data-refresh',args:{requestId:randomUUID(),revision:inspect.revision,changes:[{op:'update',id:value.nodeId,fields:{containerSpec:JSON.parse(output)}}]}})
   return {status:'updated'}
  }finally{active.delete(key)}
 }
 return {request}
}
export function registerResearchRssHandlers(options:{ipcMain:{removeHandler(channel:string):void;handle(channel:string,handler:(event:any,value:unknown)=>unknown):unknown};getMainWindow():TrustedWindow|undefined;service:ReturnType<typeof createResearchRssService>}){
 const channel='research:rss:request';options.ipcMain.removeHandler(channel);registerTrustedMainWindowHandler(options.ipcMain,channel,options.getMainWindow,(_event,value)=>options.service.request(value));return()=>options.ipcMain.removeHandler(channel)
}
