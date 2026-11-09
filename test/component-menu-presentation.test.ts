import {expect,it} from 'vitest'
import {componentMenuPresentation,componentMenuDocumentHtml} from '../src/shared/component-menu-presentation'
const state:any={menuId:'m',sessionId:'s',revision:1,dark:true,anchor:{x:700,y:300,width:206,height:22},selectedIndex:undefined,items:[{id:'copy',title:'复制组件',icon:'',group:'',badge:'',subtext:'',image:'data:image/png;base64,AAAA'},{id:'sep',title:'',icon:'',group:'',badge:'',subtext:'',separator:true},{id:'export',title:'导出',icon:'',group:'',badge:'',subtext:'',children:[{id:'svg',title:'SVG',icon:'',group:'',badge:'',subtext:''}]}]}
it('keeps the original compact menu metrics and a separate child pane',()=>{
 const view=componentMenuPresentation({...state,submenu:{parentId:'export',selectedIndex:0,keyboardActive:true}},'ticket')
 expect(view.root.width).toBe(206);expect(view.root.height).toBe(93);expect(view.root.html).toContain('width="16"');expect(view.child?.width).toBe(116);expect(view.child?.html).toContain('SVG')
 expect(componentMenuDocumentHtml).toContain('font:400 12px/16px');expect(componentMenuDocumentHtml).toContain('height:33px');expect(componentMenuDocumentHtml).not.toContain('#007aff')
})
it('escapes labels, removes actions from disabled rows, and bounds tall menus to display limits',()=>{
 const view=componentMenuPresentation({...state,items:[{...state.items[0],title:'<script>bad</script>',disabled:true}]},'ticket',{height:30})
 expect(view.root.height).toBe(30);expect(view.root.html).toContain('&lt;script&gt;');expect(view.root.html).not.toContain('href=');expect(view.root.html).toContain('aria-disabled="true"')
})
