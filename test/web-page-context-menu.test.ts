import {expect,it,vi}from'vitest'
const {templates,external,copy}=vi.hoisted(()=>({templates:[] as any[],external:vi.fn(),copy:vi.fn()}))
vi.mock('electron',()=>({Menu:{buildFromTemplate:(items:unknown)=>{templates.push(items);return{popup:vi.fn()}}},shell:{openExternal:external},clipboard:{writeText:copy},ipcMain:{}}))
import{installWebPageContextMenu}from'../src/main/context-menu'
it('adds app and explicit desktop browser actions to an isolated native page without invoking its code',()=>{
 let handler:any;const open=vi.fn(),contents={on:(_name:string,fn:any)=>{handler=fn},isDestroyed:()=>false,copyImageAt:vi.fn()},owner={isDestroyed:()=>false}
 installWebPageContextMenu(contents as never,()=>owner as never,()=> 'zh',open)
 handler({}, {linkURL:'https://example.com/read',selectionText:'',isEditable:false,editFlags:{canSelectAll:true}})
 const items=templates.at(-1);expect(items.slice(0,3).map((i:any)=>i.label)).toEqual(['在客户端浏览器中打开','在桌面浏览器中打开','复制链接地址'])
 items[0].click();expect(open).toHaveBeenCalledWith('https://example.com/read');expect(external).not.toHaveBeenCalled()
 items[1].click();expect(external).toHaveBeenCalledWith('https://example.com/read')
 items[2].click();expect(copy).toHaveBeenCalledWith('https://example.com/read')
})
