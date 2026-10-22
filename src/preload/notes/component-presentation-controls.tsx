import React from 'react'
import {updateNoteComponentPresentation} from './client-capability-actions'
/** Selected-component controls share the persisted mutation with conversational tools. */
export function NotePresentationControls({editor,block,node}:any){
 if(!editor?.isEditable)return null
 const change=(style:any)=>updateNoteComponentPresentation(editor,[block.id],style)
 return <details className="en-component-presentation-controls" data-note-export-omit="" contentEditable={false} onPointerDown={e=>e.stopPropagation()}><summary aria-label="组件样式">样式</summary><div><label>配色<select aria-label="组件配色" value={node.notePresentation?.theme||'auto'} onChange={e=>change({theme:e.target.value})}><option value="auto">跟随客户端</option><option value="light">浅色</option><option value="dark">深色</option><option value="enterprise">易方达</option><option value="openterminal">彭博</option></select></label><label><input type="checkbox" checked={node.notePresentation?.titleBar!==false} onChange={e=>change({titleBar:e.target.checked})}/>显示组件顶栏</label></div></details>
}
