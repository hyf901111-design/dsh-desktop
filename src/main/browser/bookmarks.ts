import {browserAddress,type BrowserModel} from './model'

const text=(value:unknown,label:string,max:number)=>{
 if(typeof value!=='string'||value.length>max)throw Error(label+'格式无效。')
 return value.trim()
}

/** A bookmark must point at a website; ordinary words are never converted to a search. */
export function browserBookmarkAddress(value:unknown){
 const raw=text(value,'网址',8192)
 if(!/^[a-z][a-z\d+.-]*:/i.test(raw)&&!/^\S+\.\S+$/.test(raw))throw Error('请输入完整网址。')
 return browserAddress(raw)
}

/** Edits an existing bookmark without losing its identity or creation time. */
export function updateBrowserBookmark(model:BrowserModel,input:Record<string,unknown>){
 const id=text(input.id,'收藏标识',128),bookmark=model.bookmarks.find(row=>row.id===id)
 if(!bookmark)throw Error('收藏已被移除，请刷新后重试。')
 const url=browserBookmarkAddress(input.url),title=text(input.title??'','名称',1024)||new URL(url).hostname,folder=text(input.folder??'','文件夹',100)
 if(folder&&!model.folders.includes(folder))throw Error('文件夹已被移除，请重新选择。')
 if(model.bookmarks.some(row=>row.id!==id&&row.url===url))throw Error('此网址已在收藏中，请编辑已有收藏。')
 Object.assign(bookmark,{url,title,folder})
 return bookmark
}

/** Validates the complete selection before removing any bookmark. */
export function removeBrowserBookmarks(model:BrowserModel,input:Record<string,unknown>){
 if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>5000)throw Error('请选择要删除的收藏。')
 const ids=new Set(input.ids.map(value=>{const id=text(value,'收藏标识',128);if(!id)throw Error('收藏标识格式无效。');return id}))
 const before=model.bookmarks.length
 model.bookmarks=model.bookmarks.filter(row=>!ids.has(row.id))
 return before-model.bookmarks.length
}
