import {describe,it,expect} from 'vitest'
import {BrowserModel} from '../src/main/browser/model'
import {browserBookmarkAddress,updateBrowserBookmark,removeBrowserBookmarks} from '../src/main/browser/bookmarks'

const fixture=()=>{
 const model=new BrowserModel();model.folders=['研究资料','待阅读'];model.bookmarks=[{id:'a',title:'原始标题',url:'https://first.example/',folder:'研究资料',at:12},{id:'b',title:'另一条',url:'https://second.example/',at:13}];return model
}
describe('browser bookmark management',()=>{
 it('accepts website addresses and rejects ordinary search text or privileged/local addresses',()=>{
  expect(browserBookmarkAddress('example.org/path')).toBe('https://example.org/path')
  for(const value of ['随便的搜索词','not an address','javascript:alert(1)','http://localhost:5000','https://user:pass@example.org',null])expect(()=>browserBookmarkAddress(value)).toThrow()
 })
 it('edits a bookmark by stable identity and preserves its creation time',()=>{
  const model=fixture();updateBrowserBookmark(model,{id:'a',url:'https://changed.example/path',title:' 新标题 ',folder:'待阅读'})
  expect(model.bookmarks).toEqual([{id:'a',title:'新标题',url:'https://changed.example/path',folder:'待阅读',at:12},{id:'b',title:'另一条',url:'https://second.example/',at:13}])
 })
 it('rejects invalid URLs and collisions without changing either bookmark',()=>{
  const model=fixture(),before=structuredClone(model.bookmarks)
  for(const input of [{id:'a',url:'javascript:alert(1)',title:'错误'},{id:'a',url:'https://second.example/',title:'重复'},{id:'a',url:'https://safe.example/',folder:'不存在'},{id:'missing',url:'https://safe.example/'}])expect(()=>updateBrowserBookmark(model,input)).toThrow()
  expect(model.bookmarks).toEqual(before)
 })
 it('moves a bookmark to unfiled and gives an empty title a useful hostname',()=>{
  const model=fixture();updateBrowserBookmark(model,{id:'a',url:'example.org',title:'  ',folder:''})
  expect(model.bookmarks[0]).toEqual({id:'a',title:'example.org',url:'https://example.org/',folder:'',at:12})
 })
 it('removes exactly the selected identities atomically and tolerates stale selections',()=>{
  const model=fixture();expect(removeBrowserBookmarks(model,{ids:['a','a','already-gone']})).toBe(1);expect(model.bookmarks.map(b=>b.id)).toEqual(['b'])
  expect(()=>removeBrowserBookmarks(model,{ids:['b',null]})).toThrow();expect(model.bookmarks.map(b=>b.id)).toEqual(['b'])
  expect(()=>removeBrowserBookmarks(model,{ids:[]})).toThrow()
 })
})
