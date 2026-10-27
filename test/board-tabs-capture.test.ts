import {expect,it,vi} from 'vitest'
import {registerCanvasUseWeb} from '../src/main/state/canvas-use-web'

it('组件真实缩略图按窗口缩放捕获，保留旧调用语义并校验边界',async()=>{
 const handlers=new Map<string,Function>(),frame={processId:1,routingId:2},image={getSize:()=>({width:500,height:250}),toJPEG:()=>Buffer.from('preview')}
 const capturePage=vi.fn(async()=>image),win={isDestroyed:()=>false,getContentSize:()=>[1000,700],webContents:{mainFrame:frame,getZoomFactor:()=>1.25,capturePage}}
 registerCanvasUseWeb({ipcMain:{handle:(name:string,fn:Function)=>handlers.set(name,fn)} as any,getMainWindow:()=>win as any,registry:{} as any,native:()=>undefined,authorize:()=>{}})
 const capture=handlers.get('research:canvas-use:capture')!,event={sender:win.webContents,senderFrame:frame}
 expect(await capture(event,{rect:{x:40,y:80,width:400,height:200,cssPixels:true}})).toBe('data:image/jpeg;base64,cHJldmlldw==')
 expect(capturePage).toHaveBeenLastCalledWith({x:50,y:100,width:500,height:250})
 await capture(event,{rect:{x:40,y:80,width:400,height:200}})
 expect(capturePage).toHaveBeenLastCalledWith({x:40,y:80,width:400,height:200})
 await expect(capture(event,{rect:{x:800,y:80,width:400,height:200,cssPixels:true}})).rejects.toThrow('截图区域无效')
 await expect(capture(event,{rect:{x:'40',y:80,width:400,height:200,cssPixels:true}})).rejects.toThrow('截图区域无效')
 expect(capturePage).toHaveBeenCalledTimes(2)
})
