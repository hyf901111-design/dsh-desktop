import {resolve} from 'node:path'
import {readFile} from 'node:fs/promises'
import {expect,it,vi} from 'vitest'
import {ResearchFilePreviewRegistry} from '../src/main/state/research-file-preview'
import {createHomeGuideAssetService,registerHomeGuideAssetHandlers} from '../src/main/home-guide-assets'

function fixture(ttlMs=1000){
 let now=1000,seq=0
 const registry=new ResearchFilePreviewRegistry({storage:{load:()=>[],save:()=>true},now:()=>now,randomId:()=>('guide'+(++seq)).padEnd(32,'0')})
 const service=createHomeGuideAssetService({registry,companyPresentationPath:resolve('skills/efund-ppt-maker/assets/efund-ework-onepage.pptx'),ttlMs,now:()=>now})
 return {registry,service,advance:(ms:number)=>{now+=ms}}
}
it('admits only the fixed company PPTX, serves exact bytes, denies edit identity and revokes the run',async()=>{
 const {service,registry}=fixture()
 try{
  for(const request of [{action:'grant',assetId:'../private',runId:'run-a'},{action:'grant',assetId:'company-presentation',runId:'run-a',path:'/etc/passwd'}])await expect(service.request(request)).rejects.toThrow()
  const grant=await service.request({action:'grant',assetId:'company-presentation',runId:'run-a'}) as any
  expect(grant.name).toBe('efund-ework-onepage.pptx');expect(grant.url).toMatch(/^sherlock-preview:/)
  expect(service.ownsCapability(grant.url)).toBe(true)
  expect(service.ownsIdentity(grant)).toBe(true)
  expect(await service.resolveEditableCapability(grant.url)).toBeNull()
  expect(await service.resolveEditableIdentity({sessionId:grant.sessionId,nodeId:grant.nodeId,authorizationId:grant.authorizationId})).toBeNull()
  const restored=await registry.restore({sessionId:grant.sessionId,nodeId:grant.nodeId,authorizationId:grant.authorizationId})
  expect(restored).not.toBeNull();expect(await service.resolveEditableCapability(restored!.url)).toBeNull()
  const response=await registry.handle(new Request(grant.url));expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer()).equals(await readFile('skills/efund-ppt-maker/assets/efund-ework-onepage.pptx'))).toBe(true)
  expect(await service.request({action:'grant',assetId:'company-presentation',runId:'run-a'})).toEqual(grant)
  await service.request({action:'release',runId:'run-a'})
  expect((await registry.handle(new Request(grant.url))).status).toBe(403)
 }finally{service.dispose()}
})
it('expires authorization and does not resurrect a grant cancelled during admission',async()=>{
 const {service,registry,advance}=fixture()
 const pending=service.request({action:'grant',assetId:'company-presentation',runId:'race'})
 await service.request({action:'release',runId:'race'})
 await expect(pending).rejects.toThrow()
 const grant=await service.request({action:'grant',assetId:'company-presentation',runId:'later'}) as any
 advance(1001);service.sweep()
 expect((await registry.handle(new Request(grant.url))).status).toBe(403)
 service.dispose();await expect(service.request({action:'grant',assetId:'company-presentation',runId:'again'})).rejects.toThrow()
})
it('registers only a trusted main-frame handler',async()=>{
 const {service}=fixture(),handlers=new Map<string,Function>(),window={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2}}}
 registerHomeGuideAssetHandlers({ipcMain:{removeHandler:vi.fn(),handle:(channel,handler)=>{handlers.set(channel,handler)}},getMainWindow:()=>window,service})
 const handler=handlers.get('home-guide:assets')!
 expect(()=>handler({sender:window.webContents,senderFrame:{processId:1,routingId:3}},{action:'grant',assetId:'company-presentation',runId:'x'})).toThrow(/main/)
 expect(await handler({sender:window.webContents,senderFrame:window.webContents.mainFrame},{action:'release',runId:'x'})).toEqual({ok:true})
 service.dispose()
})
