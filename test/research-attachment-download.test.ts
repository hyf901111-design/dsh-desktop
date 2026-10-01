import {it,expect,vi} from 'vitest'
import {saveResearchCanvasExport} from '../src/main/state/research-canvas-export'
const request={kind:'remote-original' as const,suggestedName:'本人虚构记录.csv',url:'http://127.0.0.1:58207/own.csv?source=own#original'}
function fixture(response:Response){return{showSaveDialog:vi.fn(async()=>({canceled:false,filePath:'/tmp/own.csv'})),writeFile:vi.fn(async()=>{}),copyFile:vi.fn(async()=>{}),resolveExportSource:vi.fn(async()=>null),fetchOriginal:vi.fn(async(_url:string,_options:RequestInit)=>response)}}
it('下载保存原始字节，保留零值负数与原文件名，不转成网页快捷方式',async()=>{
 const bytes=new TextEncoder().encode('项目,数值\n2026收入,0万元\n变化,-120万元\n缺失原因,未提供\n'),f=fixture(new Response(bytes,{headers:{'content-length':String(bytes.length)}}))
 expect(await saveResearchCanvasExport(request as never,f)).toEqual({status:'saved'})
 expect(f.fetchOriginal).toHaveBeenCalledWith(request.url,expect.anything())
 expect(f.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({defaultPath:'本人虚构记录.csv'}))
 expect(f.writeFile).toHaveBeenCalledWith('/tmp/own.csv',bytes,{mode:0o600})
})
it('未选择保存目标不取数，错误或超限响应不保存且不报告成功',async()=>{
 const cancelled=fixture(new Response('own'));cancelled.showSaveDialog.mockResolvedValue({canceled:true,filePath:'/tmp/own.csv'})
 expect(await saveResearchCanvasExport(request as never,cancelled)).toEqual({status:'cancelled'});expect(cancelled.fetchOriginal).not.toHaveBeenCalled()
 for(const response of [new Response('missing',{status:404}),new Response('large',{headers:{'content-length':'999999999'}})]){const f=fixture(response);expect(await saveResearchCanvasExport(request as never,f)).toMatchObject({status:'error'});expect(f.writeFile).not.toHaveBeenCalled()}
})
it('原文件下载拒绝本地路径和含凭据的网址，不向网络发送 Cookie',async()=>{
 for(const url of ['file:///tmp/private.csv','https://user:secret@example.com/x.csv','https://example.com/x.csv\n']){const f=fixture(new Response('own'));expect(await saveResearchCanvasExport({...request,url} as never,f)).toMatchObject({status:'error'});expect(f.fetchOriginal).not.toHaveBeenCalled();expect(f.showSaveDialog).not.toHaveBeenCalled()}
 const f=fixture(new Response('own'));await saveResearchCanvasExport(request as never,f);expect(f.fetchOriginal.mock.calls[0]?.[1]).toMatchObject({credentials:'omit',redirect:'error'})
})
it('下载允许真实零字节文件，流式响应无长度头也不能超过32MB',async()=>{
 const zero=fixture(new Response(new Uint8Array(0)));expect(await saveResearchCanvasExport(request,zero)).toEqual({status:'saved'});expect(zero.writeFile).toHaveBeenCalledWith('/tmp/own.csv',new Uint8Array(0),{mode:0o600})
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(32*1024*1024+1));controller.close()}}),over=fixture(new Response(stream));expect(await saveResearchCanvasExport(request,over)).toMatchObject({status:'error'});expect(over.writeFile).not.toHaveBeenCalled()
})
