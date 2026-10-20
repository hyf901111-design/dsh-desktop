import type {BrowserWindow} from 'electron'
import {openFinancialArticle} from '../financial/article-link'

/** The trusted shell resolves the visible session; a webpage gets no session API. */
export function openClientLink(window:BrowserWindow|undefined,url:unknown):Promise<{ok:true}> {
 return openFinancialArticle(url,async target=>{
  if(!window||window.isDestroyed())throw Error('客户端窗口不可用')
  window.webContents.send('conversation:browser',{request:'open-link',url:target})
 })
}
