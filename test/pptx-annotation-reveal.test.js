import {expect,it,vi} from 'vitest'
import {parsePptxAnnotationLocator} from '../scripts/lib/pptx-annotation-input.mjs'
import {createPptxAnnotationRevealController} from '../scripts/lib/pptx-annotation-reveal.mjs'

const reference={version:1,sessionId:'central',documentId:'a'.repeat(64),fileVersion:'b'.repeat(64),markId:'m'}
const ready=()=>({status:'ready',reference,source:{sessionId:'central',source:{kind:'workspace',relativePath:'原件.pptx'}},path:'/work/原件.pptx',name:'原件.pptx',fileVersion:reference.fileVersion,mark:{id:'m',ordinal:2,slideIndex:2,slidePart:'ppt/slides/slide3.xml'}})
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve}}
function fixture(){
 const identity={sessionId:'central'},draft='保留全部草稿和已有引用';let active=true,controller
 const select=vi.fn(),cancel=vi.fn(),activate=vi.fn(async()=>({select,cancel})),bridge={resolveReference:vi.fn(async()=>({ok:true,value:ready()}))}
 const openPreview=vi.fn(async(_identity,value)=>controller.registerViewer({source:value.source,path:value.path,isAvailable:()=>true,activate}))
 controller=createPptxAnnotationRevealController({parseReference:parsePptxAnnotationLocator,resolveInput:async()=>identity,isCurrent:()=>active,bridge,openPreview})
 return{controller,identity,draft,select,cancel,activate,bridge,openPreview,setActive:value=>active=value}
}
it('cold-opens only the Main-authorized original preview then activates and selects without drafting',async()=>{
 const f=fixture();try{expect(await f.controller.revealReference(reference)).toBe(true);expect(f.openPreview).toHaveBeenCalledWith(f.identity,ready(),{reuse:false});expect(f.bridge.resolveReference).toHaveBeenCalledTimes(2);expect(f.activate).toHaveBeenCalledWith(reference,expect.objectContaining({signal:expect.any(AbortSignal)}));expect(f.select).toHaveBeenCalledTimes(1);expect(f.draft).toBe('保留全部草稿和已有引用')}finally{f.controller.dispose()}
})
it.each(['stale','deleted','denied'])('surfaces %s without opening or selecting obsolete geometry',async status=>{
 const f=fixture();f.bridge.resolveReference.mockResolvedValue({ok:true,value:{status,error:'原标记不可定位：'+status}})
 try{await expect(f.controller.revealReference(reference)).rejects.toThrow(status);expect(f.openPreview).not.toHaveBeenCalled();expect(f.select).not.toHaveBeenCalled()}finally{f.controller.dispose()}
})
it('rejects wrong session, unauthorized path substitution and changed version',async()=>{
 const f=fixture();try{
  await expect(f.controller.revealReference({...reference,sessionId:'other'})).rejects.toThrow();expect(f.bridge.resolveReference).not.toHaveBeenCalled()
  f.bridge.resolveReference.mockResolvedValueOnce({ok:true,value:{...ready(),reference:{...reference,documentId:'c'.repeat(64)}}})
  await expect(f.controller.revealReference(reference)).rejects.toThrow();expect(f.openPreview).not.toHaveBeenCalled()
  f.bridge.resolveReference.mockResolvedValueOnce({ok:true,value:ready()}).mockResolvedValueOnce({ok:true,value:{status:'stale',error:'版本已变化'}})
  await expect(f.controller.revealReference(reference)).rejects.toThrow('版本已变化');expect(f.select).not.toHaveBeenCalled();expect(f.cancel).toHaveBeenCalledTimes(1)
 }finally{f.controller.dispose()}
})
it('waits for a newly mounted right viewer and aborts when the actual owner switches',async()=>{
 const f=fixture(),gate=deferred();f.openPreview.mockImplementation(async()=>{});f.activate.mockImplementation(async()=>{await gate.promise;return{select:f.select}})
 try{const pending=f.controller.revealReference(reference);await vi.waitFor(()=>expect(f.openPreview).toHaveBeenCalledTimes(1));f.controller.registerViewer({source:ready().source,path:ready().path,isAvailable:()=>true,activate:f.activate});await vi.waitFor(()=>expect(f.activate).toHaveBeenCalledTimes(1));f.setActive(false);gate.resolve();await expect(pending).rejects.toThrow();expect(f.select).not.toHaveBeenCalled()}finally{f.controller.dispose()}
})
it('never substitutes an unrelated or closed viewer and releases pending work on dispose',async()=>{
 const f=fixture();f.openPreview.mockImplementation(async()=>{});const wrong=f.controller.registerViewer({source:ready().source,path:'/work/another.pptx',isAvailable:()=>true,activate:f.activate});const closed=f.controller.registerViewer({source:ready().source,path:ready().path,isAvailable:()=>false,activate:f.activate})
 const pending=f.controller.revealReference(reference);await vi.waitFor(()=>expect(f.openPreview).toHaveBeenCalledTimes(1));wrong();closed();f.controller.dispose();await expect(pending).rejects.toThrow();expect(f.activate).not.toHaveBeenCalled()
})
it('propagates preview activation/save failures and readonly bridge errors instead of a silent false',async()=>{
 const f=fixture();try{f.activate.mockRejectedValueOnce(Error('编辑保存失败，仍保留编辑模式'));await expect(f.controller.revealReference(reference)).rejects.toThrow('编辑保存失败');expect(f.select).not.toHaveBeenCalled();f.bridge.resolveReference.mockResolvedValueOnce({ok:false,code:'forbidden',error:'无权读取此来源'});await expect(f.controller.revealReference(reference)).rejects.toThrow('无权读取')}finally{f.controller.dispose()}
})
