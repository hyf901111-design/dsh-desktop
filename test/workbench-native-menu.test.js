// @vitest-environment jsdom
import {expect,it,vi} from 'vitest'
import {mountWorkbenchNativeMenu} from '../scripts/lib/research-grid-ui.mjs'
it('uses a system menu with nested actions and preserves the original component callbacks',async()=>{
 document.body.innerHTML='<div id="menu"><button id="copy"><span></span><span>复制组件</span></button><div role="separator"></div><button data-workbench-native-flyout="export"><span></span><span>导出</span></button><button disabled><span></span><span>禁用操作</span></button></div>'
 const root=document.querySelector('#menu'),copy=vi.fn(),exportRun=vi.fn(),close=vi.fn();root.querySelector('#copy').onclick=copy
 let complete;const bridge=vi.fn(input=>new Promise(resolve=>{complete=resolve}));window.dshDesktop={showComponentContextMenu:bridge,closeComponentContextMenu:vi.fn()}
 const dispose=mountWorkbenchNativeMenu(root,{export:[{label:'SVG',run:exportRun}]},close)
 await vi.waitFor(()=>expect(bridge).toHaveBeenCalledOnce());const input=bridge.mock.calls[0][0]
 expect(root.style.visibility).toBe('hidden');expect(input.items.map(i=>i.label??i.separator)).toEqual(['复制组件',true,'导出','禁用操作']);
 expect(input.items[3].disabled).toBe(true);complete(input.items[2].children[0].id)
 await vi.waitFor(()=>expect(exportRun).toHaveBeenCalledOnce());expect(copy).not.toHaveBeenCalled();dispose()
})
it('ignores a stale native result after the component/menu has been removed',async()=>{
 document.body.innerHTML='<div id="menu"><button><span></span><span>复制</span></button></div>';const root=document.querySelector('#menu'),action=vi.fn(),close=vi.fn();root.querySelector('button').onclick=action
 let complete;window.dshDesktop={showComponentContextMenu:vi.fn(input=>new Promise(resolve=>{complete=resolve})),closeComponentContextMenu:vi.fn()}
 const dispose=mountWorkbenchNativeMenu(root,{},close);await vi.waitFor(()=>expect(window.dshDesktop.showComponentContextMenu).toHaveBeenCalledOnce());const input=window.dshDesktop.showComponentContextMenu.mock.calls[0][0];dispose();complete(input.items[0].id)
 await Promise.resolve();expect(action).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(window.dshDesktop.closeComponentContextMenu).toHaveBeenCalledWith(input.menuId)
})
