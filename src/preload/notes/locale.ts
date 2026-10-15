import {useEffect,useReducer} from 'react'
import {en,zh} from '@blocknote/core/locales'
/** Rerender presentation without rebuilding the editor or changing its Yjs document. */
export function useNoteUiLocale(){
 const [,render]=useReducer(value=>value+1,0)
 useEffect(()=>{const observer=new MutationObserver(()=>render());observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});return()=>observer.disconnect()},[])
}
export function notePlaceholderCss(locale:string|undefined){
 const dictionary=locale==='en'?en:zh
 return Object.entries(dictionary.placeholders).map(([type,value])=>{
  const selector=type==='default'?'[data-is-empty-and-focused]':type==='emptyDocument'?'[data-is-only-empty-block]':'[data-content-type="'+type+'"]'
  return '.en-root .bn-block-content'+selector+':has(.ProseMirror-trailingBreak:only-child):after{content:'+JSON.stringify(value)+'!important}'
 }).join('\n')
}
