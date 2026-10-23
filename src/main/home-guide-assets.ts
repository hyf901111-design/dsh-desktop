import {randomUUID} from 'node:crypto'
import {registerTrustedMainWindowHandler,type TrustedWindow} from './ipc-trust'
import type {ResearchFilePreviewDescriptor,ResearchFilePreviewRegistry} from './state/research-file-preview'

type GuideGrant=ResearchFilePreviewDescriptor & {sessionId:string;nodeId:string;expiresAt:number;readOnly:true}
type Lease={sessionId:string;nodeId:string;expiresAt:number;grant?:GuideGrant;pending?:Promise<GuideGrant>;cancelled:boolean;timer?:ReturnType<typeof setTimeout>}
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[\w:-]{1,128}$/.test(value)
/** App-owned examples never resolve through a user workspace or a renderer-supplied path. */
export function createHomeGuideAssetService(options:{registry:ResearchFilePreviewRegistry;companyPresentationPath:string;now?:()=>number;ttlMs?:number}){
 const {registry}=options,now=options.now??Date.now,ttl=Math.max(100,Math.min(options.ttlMs??5*60_000,5*60_000)),leases=new Map<string,Lease>()
 let stopped=false
 const revoke=(runId:string,lease:Lease)=>{lease.cancelled=true;clearTimeout(lease.timer);if(leases.get(runId)===lease)leases.delete(runId);registry.revokeNode(lease.sessionId,lease.nodeId)}
 const sweep=()=>{for(const[id,lease]of leases)if(lease.expiresAt<=now())revoke(id,lease)}
 const ownsIdentity=(value:unknown)=>{const input=value as {sessionId?:unknown}|null;return typeof input?.sessionId==='string'&&input.sessionId.startsWith('home-guide-presentation:')}
 return {
  sweep,
  ownsCapability(url:unknown){return typeof url==='string'&&[...leases.values()].some(lease=>lease.grant?.url===url)},
  ownsIdentity,
  // These replace the editor's two existing resolvers. Resolve the identity,
  // not only the initial token: restoring a preview can mint another token.
  async resolveEditableCapability(url:string){const source=await registry.resolvePptxEditSource(url);return ownsIdentity(source?.identity)?null:source},
  async resolveEditableIdentity(value:unknown){return ownsIdentity(value)?null:registry.resolvePptxEditIdentity(value)},
  async request(value:unknown):Promise<GuideGrant|{ok:true}>{
   if(stopped)throw Error('教程资源服务已关闭。')
   const input=value as {action?:unknown;assetId?:unknown;runId?:unknown}|null
   if(!input||!validId(input.runId)||!['grant','release'].includes(String(input.action)))throw Error('教程资源请求无效。')
   const keys=Object.keys(input).sort().join(',')
   if(input.action==='release'){
    if(keys!=='action,runId')throw Error('教程资源请求无效。')
    const old=leases.get(input.runId);if(old)revoke(input.runId,old)
    return {ok:true}
   }
   if(keys!=='action,assetId,runId'||input.assetId!=='company-presentation')throw Error('不支持的教程资源。')
   sweep();const previous=leases.get(input.runId)
   if(previous)return previous.grant??previous.pending!
   const runId=input.runId,lease:Lease={sessionId:'home-guide-presentation:'+randomUUID(),nodeId:'company-presentation',expiresAt:now()+ttl,cancelled:false}
   leases.set(runId,lease)
   lease.timer=setTimeout(()=>revoke(runId,lease),ttl);lease.timer.unref?.()
   lease.pending=(async()=>{
    const descriptor=await registry.admitFinder({path:options.companyPresentationPath,sessionId:lease.sessionId,nodeId:lease.nodeId})
    if(!descriptor||lease.cancelled||stopped||leases.get(runId)!==lease||lease.expiresAt<=now()){
     revoke(runId,lease);throw Error('教程资源已失效，请重新播放。')
    }
    return lease.grant={...descriptor,sessionId:lease.sessionId,nodeId:lease.nodeId,expiresAt:lease.expiresAt,readOnly:true}
   })()
   return lease.pending
  },
  dispose(){if(stopped)return;stopped=true;for(const[id,lease]of leases)revoke(id,lease)}
 }
}
export type HomeGuideAssetService=ReturnType<typeof createHomeGuideAssetService>
export function registerHomeGuideAssetHandlers(options:{ipcMain:{removeHandler(channel:string):void;handle(channel:string,handler:(event:any,input:unknown)=>unknown):unknown};getMainWindow():TrustedWindow|undefined;service:HomeGuideAssetService}):void{
 options.ipcMain.removeHandler('home-guide:assets')
 registerTrustedMainWindowHandler(options.ipcMain,'home-guide:assets',options.getMainWindow,(_event,input:unknown)=>options.service.request(input))
}
