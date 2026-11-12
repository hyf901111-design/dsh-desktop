import {load} from 'cheerio'

// Match the host source footer's two supported forms without executing HTML.
// Metadata inside implementation text or an inert template is not a citation.
export function componentSourceMetadata(html) {
 if(typeof html!=='string')return []
 const $=load(html)
 $('script,style,template,head').remove()
 return $('[data-component-source-info]').toArray().flatMap(element=>{
  const node=$(element),annotation=node.attr('data-component-source-info')?.trim()
  if(annotation)return [annotation]
  if(node.find('table,svg,canvas,button,input,select,textarea,[data-sherlock-structure],[data-node-id]').length)return []
  const text=node.text().trim()
  return text?[text]:[]
 })
}
