import {expect,it,vi} from 'vitest'
const transport=vi.hoisted(()=>({options:undefined as any,sync:vi.fn(),close:vi.fn()}))
vi.mock('../src/main/notes/native-menu',()=>({NoteNativeMenu:class{constructor(options:any){transport.options=options}sync=transport.sync;close=transport.close}}))
import {ComponentPopupMenu} from '../src/main/component-popup-menu'
it('anchors the popup to the caller button, opens a separate child, and resolves only its selected callback ID',async()=>{
 const popup=new ComponentPopupMenu({webContents:{id:9},isDestroyed:()=>false} as any),anchor={x:600,y:300,width:206,height:24}
 const result=popup.show({menuId:'a',anchor,dark:true,items:[{id:'export',label:'导出',children:[{id:'svg',label:'SVG'}]}]})
 expect(transport.options.displayBounds).toBe(true);expect(transport.sync.mock.calls.at(-1)?.[0].anchor).toEqual(anchor)
 transport.options.emit({menuId:'a',revision:0,action:'open',itemId:'export'})
 expect(transport.sync.mock.calls.at(-1)?.[0].submenu.parentId).toBe('export')
 transport.options.emit({menuId:'a',revision:1,action:'select',parentId:'export',itemId:'svg'})
 await expect(result).resolves.toBe('svg')
})
it('keyboard selection skips disabled options and cancellation returns no action',async()=>{
 const popup=new ComponentPopupMenu({webContents:{id:9},isDestroyed:()=>false} as any)
 const result=popup.show({menuId:'b',anchor:{x:100,y:200,width:206,height:22},items:[{id:'disabled',label:'不可用',disabled:true},{id:'active',label:'可用'}]})
 popup.key('b','ArrowDown');expect(transport.sync.mock.calls.at(-1)?.[0].selectedIndex).toBe(1)
 popup.key('b','Escape');await expect(result).resolves.toBeNull()
})
