import {expect,it,vi} from 'vitest'
import {workbenchImageEvidence,workbenchRequestImages} from '../packages/dsh-research-task-runtime/workbench-image-evidence.js'
import {restoreWorkbenchHostContext} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'
import {createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'

const image=id=>({type:'image',attachment:{attachmentId:id,mediaType:'image/png',bytes:3,width:1,height:1}})
const user=(id,images=[])=>({type:'user/message',data:{id,source:{kind:'user'},content:[...images,{type:'text',text:'根据原型创建数字运营工作台'}]}})
const context={sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'数字运营'},sourceRequirement:'待办列表',sourceMessageId:'original'}
const parent=()=>({id:'parent',options:{provider:'configured',model:'actual-vision'},session:{events:[user('original',[image('prototype')]),user('newer',[image('unrelated')])]}})
const service=(modalities=['text','image'])=>({llm:{resolveModelInfo:vi.fn(async()=>modalities===undefined?{}:{inputModalities:modalities})},attachments:{readImage:vi.fn(async ref=>({ref,data:Buffer.of(1,2,3)}))}})

it('keeps original visual evidence by exact human message ID despite a later user image',async()=>{
 const p=parent(),ctx=service(),result=await workbenchImageEvidence(ctx,p,'original',p.options,new AbortController().signal)
 expect(result).toEqual([image('prototype')]);expect(result[0]).not.toBe(p.session.events[0].data.content[0])
 expect(ctx.llm.resolveModelInfo).toHaveBeenCalledWith('configured','actual-vision',expect.any(AbortSignal));expect(ctx.attachments.readImage.mock.calls[0][0]).toEqual(image('prototype').attachment)
})
it('restores only a bounded host-owned message identity without copying image bytes into task metadata',()=>{
 const restored=restoreWorkbenchHostContext(context);expect(restored.sourceMessageId).toBe('original');expect(Object.isFrozen(restored)).toBe(true)
 expect(()=>restoreWorkbenchHostContext({...context,sourceMessageId:'x'.repeat(257)})).toThrow();expect(JSON.stringify(restored)).not.toContain('prototype')
})
it('reads a queued original from the authored inbox without switching to unrelated history',()=>{
 expect(workbenchRequestImages({events:[{type:'agent/inbox/spliced',data:{inserted:[user('queued',[image('queued-prototype')]).data]}},user('newer',[image('unrelated')])]},'queued')).toEqual([image('queued-prototype')])
})
it.each(['missing','nonhuman','invalid-reference'])('fails explicitly instead of replacing missing evidence: %s',async failure=>{
 const p=parent();if(failure==='nonhuman')p.session.events[0].data.source={kind:'plugin'};if(failure==='invalid-reference')delete p.session.events[0].data.content[0].attachment.attachmentId
 expect(()=>workbenchRequestImages(p.session,failure==='missing'?'absent':'original')).toThrow(/原始需求|原型图片/)
})
it('does not resolve a model or fetch images for a text-only request',async()=>{
 const p=parent();p.session.events=[user('original')];const ctx=service()
 expect(await workbenchImageEvidence(ctx,p,'original',p.options)).toEqual([]);expect(ctx.llm.resolveModelInfo).not.toHaveBeenCalled();expect(ctx.attachments.readImage).not.toHaveBeenCalled()
})
it('rejects a known text-only component model without reading, dropping or rewriting the original image',async()=>{
 const p=parent(),ctx=service(['text']);await expect(workbenchImageEvidence(ctx,p,'original',p.options)).rejects.toThrow(/不支持图片/)
 expect(ctx.attachments.readImage).not.toHaveBeenCalled();expect(p.session.events[0].data.content[0]).toEqual(image('prototype'))
})
it('retains the native admission compatibility policy for unspecified modalities without claiming provider validation',async()=>{
 const p=parent(),ctx=service();ctx.llm.resolveModelInfo.mockResolvedValue({})
 expect(await workbenchImageEvidence(ctx,p,'original',p.options)).toEqual([image('prototype')]);expect(ctx.attachments.readImage).toHaveBeenCalledOnce()
})
it.each(['denied','missing-service'])('never starts a silent text-only child when image reads fail: %s',async failure=>{
 const p=parent(),ctx=service();if(failure==='denied')ctx.attachments.readImage.mockRejectedValue(Error('unavailable'));else delete ctx.attachments
 await expect(workbenchImageEvidence(ctx,p,'original',p.options)).rejects.toThrow(/图片.*(?:读取|读取服务)/)
})
it('cancels in-flight model capability resolution before reading images or starting a child',async()=>{
 const p=parent(),ctx=service(),controller=new AbortController()
 ctx.llm.resolveModelInfo.mockImplementation((_provider,_model,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})))
 const pending=workbenchImageEvidence(ctx,p,'original',p.options,controller.signal);controller.abort(Error('cancelled'))
 await expect(pending).rejects.toThrow('cancelled');expect(ctx.attachments.readImage).not.toHaveBeenCalled()
})
it('passes the original durable images into the actual native child prompt after model and attachment checks',async()=>{
 const p=parent(),child={id:'child',session:{events:[]}},ctx=service(),resolve=Promise.withResolvers()
 Object.assign(ctx,{agents:{get:id=>id==='parent'?p:undefined},tools:{schemas:()=>[]},subagents:{start:vi.fn(async()=>({id:'child',localAgent:child,result:resolve.promise,dispose:async()=>{}}))},on:()=>()=>{},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:p.options,routable:true,groups:[]}}})}}})
 const adapter=createSubagentAdapter(ctx),handle=await adapter.start({parentSessionId:'parent',kind:'container',query:'离线生成待办列表组件，不联网。',prompt:'按照原图生成待办列表',hostContext:context,signal:new AbortController().signal,onSessionEvent(){}})
 try{expect(ctx.subagents.start).toHaveBeenCalledOnce();const request=ctx.subagents.start.mock.calls[0][1];expect(request.prompt[0]).toEqual(image('prototype'));expect(request.prompt.at(-1).type).toBe('text');expect(request.prompt.some(part=>part.attachment?.attachmentId==='unrelated')).toBe(false)}finally{await handle.dispose();await adapter.dispose()}
})
