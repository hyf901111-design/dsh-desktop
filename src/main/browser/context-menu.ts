import type {MenuItemConstructorOptions} from 'electron'
import {buildContextMenuTemplate,type ContextMenuState,type ContextMenuActions} from '../context-menu-template'

export type BrowserPageAction='save-page'|'save-image'|'print'|'reload'|'translate'|'translation-restore'|'translation-stop'|'ask-ework'
/** Native page actions always target the clicked document, not a focused app input. */
export function browserPageContextMenu(state:ContextMenuState,actions:ContextMenuActions,options:{loading:boolean;translating:boolean;canRestore:boolean;region:boolean;image?:boolean;perform:(action:BrowserPageAction)=>void;edit:(action:string)=>void}):MenuItemConstructorOptions[]{
 const template=buildContextMenuTemplate(state,'zh',actions).map(item=>item.role?{...item,role:undefined,click:()=>options.edit(String(item.role))}:item)
 if(options.image)template.splice(Math.max(0,template.findIndex(item=>item.label==='复制图片')+1),0,{label:'保存图片…',click:()=>options.perform('save-image')})
 if(template.length)template.push({type:'separator'})
 template.push(
  {label:'另存网页…',click:()=>options.perform('save-page')},
  {label:'打印…',click:()=>options.perform('print')},
  {label:'刷新',click:()=>options.perform('reload')},
  {type:'separator'},
  options.translating?{label:'停止翻译',click:()=>options.perform('translation-stop')}:{label:options.canRestore?'还原页面语言显示':'翻译为中文',enabled:!options.loading||options.canRestore,click:()=>options.perform(options.canRestore?'translation-restore':'translate')},
  {label:'框选并询问AI',enabled:options.region&&!options.loading,click:()=>options.perform('ask-ework')}
 )
 return template
}
