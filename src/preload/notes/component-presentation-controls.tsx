import React from 'react'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import {useNoteUiLocale} from './locale'
import {updateNoteComponentPresentation} from './client-capability-actions'
/** Selected-component controls share the persisted mutation with conversational tools. */
export function NotePresentationControls({editor,block,node}:any){
 useNoteUiLocale()
 if(!editor?.isEditable)return null
 const change=(style:any)=>updateNoteComponentPresentation(editor,[block.id],style)
 return <details className="en-component-presentation-controls" data-note-export-omit="" contentEditable={false} onPointerDown={e=>e.stopPropagation()}><summary aria-label={t('组件样式')}>{t('样式')}</summary><div><label>{t('配色')}<select aria-label={t('组件配色')} value={node.notePresentation?.theme||'auto'} onChange={e=>change({theme:e.target.value})}><option value="auto">{t('跟随客户端')}</option><option value="light">{t('浅色')}</option><option value="dark">{t('深色')}</option><option value="enterprise">{t('易方达')}</option><option value="openterminal">{t('彭博')}</option></select></label><label><input type="checkbox" checked={node.notePresentation?.titleBar!==false} onChange={e=>change({titleBar:e.target.checked})}/>{t('显示组件顶栏')}</label></div></details>
}
