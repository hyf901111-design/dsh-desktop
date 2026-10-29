import {readFileSync} from 'node:fs'
import {parse} from '@babel/parser'
export function stripComponentSurfaceMenu(source){
 const marker='/* ework:component-surface-ui:v1 */',end='/* ework:component-surface-ui:end */',start=source.indexOf(marker),stop=source.indexOf(end)
 if(start<0&&stop<0)return source
 if(start<0||stop<start||source.indexOf(marker,start+marker.length)>=0||source.indexOf(end,stop+end.length)>=0)throw Error('Surface menu restore marker incomplete or ambiguous')
 return source.slice(0,start)+source.slice(stop+end.length).replace(/^\n/u,'')
}
export function patchComponentSurfaceMenu(source){
 const marker='/* ework:component-surface-ui:v1 */',end='/* ework:component-surface-ui:end */'
 // Use the saved production function, never a test runner's SSR/toString shim.
 const module=readFileSync(new URL('./component-surface-ui.mjs',import.meta.url),'utf8'),functions=parse(module,{sourceType:'module'}).program.body.filter(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.type==='FunctionDeclaration'&&node.declaration.id?.name==='createComponentSurfaceUi').map(node=>node.declaration)
 if(functions.length!==1)throw Error('Surface menu factory missing or ambiguous')
 const factory=module.slice(functions[0].start,functions[0].end)
 const palettes=readFileSync(new URL('../../packages/dsh-research-task-runtime/workbench-style.js',import.meta.url),'utf8'),paletteNodes=parse(palettes,{sourceType:'module'}).program.body.filter(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.type==='FunctionDeclaration'&&node.declaration.id?.name==='workbenchStylePalette').map(node=>node.declaration)
 if(paletteNodes.length!==1)throw Error('Component palette missing or ambiguous')
 const palette=palettes.slice(paletteNodes[0].start,paletteNodes[0].end).replace('function workbenchStylePalette(','function(')
 const code=marker+'\n'+factory+'\nconst eworkComponentSurfaceUi=createComponentSurfaceUi({React:react,createPortal:react_dom.createPortal,Icon:WorkbenchIcon,palette:'+palette+',css:'+JSON.stringify(readFileSync(new URL('./component-surface-menu.css',import.meta.url),'utf8'))+'});\n'+end+'\n'
 source=stripComponentSurfaceMenu(source)
 const conversation=['/* ework:conversation-components:v1 */','/* ework:conversation-components:v2 */'].map(marker=>source.indexOf(marker)).filter(index=>index>=0),anchor=conversation.length?Math.min(...conversation):source.indexOf('const ExecutionStatusGroup =')
 if(anchor<0)throw Error('Surface menu host anchor missing')
 return source.slice(0,anchor)+code+source.slice(anchor)
}
