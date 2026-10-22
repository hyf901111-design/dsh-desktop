import {useLayoutEffect} from 'react'
import {workbenchStylePalette} from '../../../packages/dsh-research-task-runtime/workbench-style.js'
import type {NotePresentation} from './client-capability-actions'
/** Reuses the canvas palette and frame protocol; no alternate E Fund colors. */
export function installNotePresentation(root:HTMLElement,style:NotePresentation|undefined,dark:boolean){
 const mode=style?.theme&&style.theme!=='auto'?style.theme:dark?'dark':'light',palette=workbenchStylePalette(mode)
 root.dataset.notePresentation='';root.dataset.workbenchStyle=mode;root.dataset.financialTheme=mode;root.dataset.noteTitlebar=style?.titleBar===false?'hidden':'visible';root.dataset.noteFrame=style?.frame===false?'hidden':'visible'
 for(const [key,value] of Object.entries(palette))root.style.setProperty('--sherlock-'+key,value as string)
 for(const [key,token] of Object.entries({'--en-bg':'surface','--en-text':'text','--en-ink':'text','--en-control':'control-bg','--en-popup':'surface','--en-muted':'muted','--en-border':'border','--odyssey-content':'surface','--odyssey-text':'text','--dsw-alias-bg-layer-1':'surface','--dsw-alias-text-primary':'text','--grid-card':'surface','--grid-text':'text','--grid-muted':'muted','--grid-border':'border'}))root.style.setProperty(key,palette[token]??'')
 const send=(frame:HTMLIFrameElement)=>{frame.contentWindow?.postMessage({type:'sherlock-workbench-style',mode,controlTheme:mode==='dark'||mode==='openterminal'?'dark':'light'},'*');frame.contentWindow?.postMessage({type:'sherlock-theme',colorScheme:mode==='dark'||mode==='openterminal'?'dark':'light'},'*')}
 const sync=()=>root.querySelectorAll('iframe').forEach(send),loaded=(event:Event)=>{if((event.target as Element)?.tagName==='IFRAME')send(event.target as HTMLIFrameElement)}
 const observer=new MutationObserver(sync);observer.observe(root,{childList:true,subtree:true});root.addEventListener('load',loaded,true);sync()
 return()=>{observer.disconnect();root.removeEventListener('load',loaded,true)}
}
export function useNotePresentation(root:{current:HTMLElement|null},node:any,dark:boolean){useLayoutEffect(()=>root.current?installNotePresentation(root.current,node.notePresentation,dark):undefined,[root,node.notePresentation?.theme,node.notePresentation?.titleBar,node.notePresentation?.frame,dark])}
