import {expect,it} from 'vitest'
import {BrowserModel,browserAddress,browserDownloadAddress,availableDownloadPath} from '../src/main/browser/model'

it('resolves addresses and searches without admitting privileged protocols or embedded credentials',()=>{
 expect(browserAddress('example.com/path','Google')).toBe('https://example.com/path')
 expect(browserAddress('消费 研究','Bing')).toBe('https://www.bing.com/search?q=%E6%B6%88%E8%B4%B9%20%E7%A0%94%E7%A9%B6')
 for(const raw of ['file:///etc/passwd','javascript:alert(1)','http://localhost:5000','https://user:secret@example.com','data:text/html,test'])expect(()=>browserAddress(raw,'Google')).toThrow()
})
it('admits same-origin Blob exports and reserves distinct filenames for simultaneous reports',()=>{
 expect(browserDownloadAddress('blob:https://example.com/report','https://example.com/editor')).toBe('blob:https://example.com/report')
 expect(()=>browserDownloadAddress('blob:https://other.example/report','https://example.com/editor')).toThrow()
 expect(availableDownloadPath('/tmp','report.pdf',new Set(['/tmp/report.pdf']),()=>false)).toBe('/tmp/report (1).pdf')
 expect(availableDownloadPath('/tmp','report.pdf',new Set(['/tmp/report (1).pdf']),p=>p==='/tmp/report.pdf')).toBe('/tmp/report (2).pdf')
})
it('restores normal tabs but never records private tabs, private history or private recently closed entries',()=>{
 const model=new BrowserModel(),normal=model.newTab(),privateTab=model.newTab(true)
 model.visited(normal.id,'https://example.com','普通网页')
 model.visited(privateTab.id,'https://private.example.com','隐私网页')
 model.close(privateTab.id)
 const saved=model.serialize()
 expect(JSON.stringify(saved)).not.toMatch(/private.example|隐私网页/)
 const restored=new BrowserModel(saved)
 expect(restored.tabs.some(t=>t.url==='https://example.com/')).toBe(true)
 expect(restored.history).toHaveLength(1)
 expect(restored.closed).toHaveLength(0)
})
it('keeps a usable last tab and restores only the closed target with its pin and mute state',()=>{
 const m=new BrowserModel(),a=m.newTab();a.pinned=true;a.muted=true;m.close(a.id)
 expect(m.tabs).toHaveLength(1)
 expect(m.tabs[0]!.url).toBe('')
 const restored=m.restore();expect(restored).toMatchObject({pinned:true,muted:true})
 expect(restored!.id).not.toBe(a.id)
})
it('bounds history, keeps folders and bookmarks, and clears only the selected time range',()=>{
 const m=new BrowserModel(),a=m.newTab();m.visited(a.id,'https://example.com','Example')
 m.bookmarks.push({id:'b',title:'Example',url:'https://example.com',folder:'研究资料',at:1})
 m.history.push({id:'old',title:'Old',url:'https://old.example.com',at:1})
 m.clearHistory(Date.now()-10000)
 expect(m.history.map(h=>h.id)).toEqual(['old'])
 expect(m.bookmarks).toHaveLength(1)
 expect(new BrowserModel(m.serialize()).bookmarks).toEqual(m.bookmarks)
})

it('keeps favicon resources transient and excludes private icons from saved browser state',()=>{
 const model=new BrowserModel(),normal=model.newTab(),privateTab=model.newTab(true)
 normal.url='https://example.com/';normal.favicon='data:image/png;base64,normal-icon';privateTab.url='https://private.example/';privateTab.favicon='data:image/png;base64,private-icon'
 const saved=model.serialize();expect(JSON.stringify(saved)).not.toMatch(/normal-icon|private-icon|private.example|favicon/)
 expect(new BrowserModel({...saved,tabs:[{...saved.tabs[0],favicon:'file:///private/icon.png'}]}).tabs[0]!.favicon).toBeUndefined()
})
