import {expect,it,vi} from 'vitest'
import {buildNativeComponentMenu} from '../src/main/native-component-menu'
it('preserves nested component actions while returning only an action ID',()=>{
 const choose=vi.fn();const items=buildNativeComponentMenu([{id:'copy',label:'复制组件'},{separator:true},{id:'export',label:'导出',children:[{id:'svg',label:'SVG'}]},{id:'remove',label:'移除组件',disabled:true}],choose)
 expect(items.map(i=>i.label??i.type)).toEqual(['复制组件','separator','导出','移除组件']);
 const children=items[2]!.submenu as any[];children[0].click();expect(choose).toHaveBeenCalledExactlyOnceWith('svg');
 (items[3]!.click as Function)();expect(choose).toHaveBeenCalledTimes(1);
})
it('does not forward native roles, commands, selectors or external images',()=>{
 const icon=vi.fn(()=>'template-image');const items=buildNativeComponentMenu([{id:'a',label:'操作',role:'quit',click:'shell',icon:'https://example.org/icon.png'},{id:'b',label:'操作二',icon:'data:image/png;base64,AAAA'}],vi.fn(),icon)
 expect(items[0]).not.toHaveProperty('role');expect(items[0]).not.toHaveProperty('icon');expect(icon).toHaveBeenCalledTimes(1);expect(items[1]).toHaveProperty('icon');
 expect(buildNativeComponentMenu(Array(100).fill({id:'a',label:'a'}),vi.fn())).toEqual([])
 expect(buildNativeComponentMenu([{id:'same',label:'a'},{id:'same',label:'b'}],vi.fn()).map(i=>i.id)).toEqual(['same'])
})
