import { randomUUID } from 'node:crypto'
import type { ComponentLibraryStore } from '../state/component-library'
import { componentLibraryBuiltins } from '../../../packages/dsh-research-task-runtime/component-library-catalog.js'
import { financialWidgetDefaults, financialWidgetDimensions } from '../../../packages/dsh-research-task-runtime/financial-widget-contract.js'

export function noteLibraryItems(store: ComponentLibraryStore) {
  return [
    ...componentLibraryBuiltins().map(item=>({id:item.id,title:item.name,icon:item.widget==='quote'?'stock_quote':item.widget,group:'内置组件'})),
    ...store.list().map(item=>({id:item.id,title:item.name,icon:'library',group:'自定义组件'}))
  ]
}
export function noteLibraryNode(store: ComponentLibraryStore, id: string, owner: string): Record<string, any> {
  if (typeof id !== 'string' || !id || id.length > 128) throw Error('组件库选项无效。')
  const preset=componentLibraryBuiltins().find(item=>item.id===id)
  let node:Record<string,any>
  if(preset){
    const spec=preset.widget==='calendar'?{version:1,type:'calendar-tool',title:preset.name}:financialWidgetDefaults(preset.widget)!
    const size=preset.widget==='calendar'?{width:620,height:420}:financialWidgetDimensions(spec)!
    node={kind:'generated-container',title:preset.name,containerSpec:spec,...size,generationStatus:'completed',refreshMinutes:0}
  } else node=store.read(id,owner).node
  // A note instance never aliases the template or a source canvas identity.
  return {...structuredClone(node),id:'note-component-'+randomUUID(),noteLibrary:true}
}
export function findNoteComponent(blocks:any[], id:string):Record<string,any>|undefined {
  for(const block of blocks){
    if(block.type==='research')try{const node=JSON.parse(block.props?.payload);if(node?.id===id)return node}catch{}
    if(block.children){const node=findNoteComponent(block.children,id);if(node)return node}
  }
}
