import {basename,extname} from 'node:path'
import {browserDownloadAddress} from './model'

const imageTypes=new Map([['image/png','.png'],['image/jpeg','.jpg'],['image/gif','.gif'],['image/webp','.webp'],['image/avif','.avif'],['image/bmp','.bmp'],['image/svg+xml','.svg'],['image/x-icon','.ico'],['image/vnd.microsoft.icon','.ico']])
/** Only an explicitly clicked image may use an inline image download URL. */
export function browserImageAddress(raw:unknown,ownerUrl:string):string{
 if(typeof raw!=='string'||!raw||raw.length>24000000)throw Error('图片地址无效或图片过大。')
 if(!raw.startsWith('data:')){if(!/^(https?:|blob:)/i.test(raw))throw Error('图片地址无效。');return browserDownloadAddress(raw,ownerUrl)}
 const comma=raw.indexOf(','),header=raw.slice(5,comma),mime=(header.split(';')[0]||'').toLowerCase()
 if(comma<0||!imageTypes.has(mime)||header.length>100||!/^image\/[\w.+-]+(?:;charset=[\w-]+)?(?:;base64)?$/i.test(header))throw Error('只支持保存图片内容。')
 const payload=raw.slice(comma+1)
 if(!payload||(/;base64$/i.test(header)?!/^[A-Za-z0-9+/]+={0,2}$/.test(payload):mime!=='image/svg+xml'))throw Error('图片内容无效。')
 if(mime==='image/svg+xml'&&!/;base64$/i.test(header)){try{decodeURIComponent(payload)}catch{throw Error('图片内容无效。')}}
 return raw
}
export function browserImageFilename(filename:string,mime:string):string{
 const name=basename(filename).replace(/[\x00-\x1f]/g,'').slice(0,180),extension=extname(name).toLowerCase(),known=[...imageTypes.values()].includes(extension)||extension==='.jpeg'
 return known&&name?name:((name&&name!=='download'?name.replace(/\.[^.]*$/,''):'图片')||'图片')+(imageTypes.get(mime.toLowerCase())||'.png')
}
