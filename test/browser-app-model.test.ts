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

it('reorders tabs in both directions while preserving the active document and persistent order',()=>{
 const m=new BrowserModel(),a=m.newTab(),b=m.newTab(),c=m.newTab();a.title='A';b.title='B';c.title='C';b.pinned=true;m.activeId=b.id
 m.reorder(c.id,a.id);expect(m.tabs.map(t=>t.title)).toEqual(['C','A','B']);expect(m.activeId).toBe(b.id);expect(m.tab(b.id).pinned).toBe(true)
 m.reorder(c.id);expect(m.tabs.map(t=>t.title)).toEqual(['A','B','C']);m.reorder(a.id,a.id);expect(m.tabs.map(t=>t.title)).toEqual(['A','B','C'])
 const restored=new BrowserModel(m.serialize());expect(restored.tabs.map(t=>t.title)).toEqual(['A','B','C']);expect(restored.tab(restored.activeId).title).toBe('B')
 const before=m.tabs.slice();expect(()=>m.reorder(a.id,'closed-tab')).toThrow();expect(m.tabs).toEqual(before)
})

it('preserves internal page types through tab order, persistence and recently closed restoration',()=>{
 const m=new BrowserModel(),website=m.newTab(),history=m.newTab(false,'history'),downloads=m.newTab(false,'downloads')
 m.visited(website.id,'https://example.com/','Example');m.visited(history.id,'https://ignored.example/','Ignored')
 expect(history).toMatchObject({page:'history',url:'',title:'历史记录',private:false,loading:false})
 expect(downloads).toMatchObject({page:'downloads',url:'',title:'下载内容',private:false})
 expect(m.history.map(row=>row.url)).toEqual(['https://example.com/'])
 m.reorder(downloads.id,website.id);m.activeId=history.id
 const saved=m.serialize(),restored=new BrowserModel(saved)
 expect(restored.tabs.map(tab=>tab.page??tab.url)).toEqual(['downloads','https://example.com/','history'])
 expect(restored.tab(restored.activeId)).toMatchObject({page:'history',url:'',title:'历史记录'})
 history.pinned=true;history.muted=true;m.close(history.id)
 const reopened=new BrowserModel(m.serialize()).restore()
 expect(reopened).toMatchObject({page:'history',url:'',title:'历史记录',private:false,pinned:true,muted:true})
 expect(reopened!.id).not.toBe(history.id)
 expect(()=>m.newTab(true,'downloads')).toThrow()
})

it('rejects forged saved internal page kinds and mixed URLs before restoring native or HTTP documents',()=>{
 const metadata={id:'saved',title:'Forged title',at:1},badRows=[
  {page:'file:///etc/passwd',url:''},{page:'history',url:'file:///etc/passwd'},
  {page:'downloads',url:'https://example.com/'},{page:'history',url:'',private:true},
  {page:'settings',url:'https://example.com/'},{url:'javascript:alert(1)'}
 ]
 const m=new BrowserModel({version:1,tabs:[...badRows,{page:'history',url:'',title:'Spoofed'},{page:'downloads',url:''},{url:'https://example.com/',title:'Example'}],closed:[...badRows.map(row=>({...metadata,...row})),{...metadata,page:'downloads',url:''}],history:[{...metadata,url:'https://example.com/',page:'history'}],bookmarks:[{...metadata,url:'https://example.com/',page:'downloads'}]})
 expect(m.tabs.map(tab=>tab.page??tab.url)).toEqual(['history','downloads','https://example.com/'])
 expect(m.tabs[0]).toMatchObject({title:'历史记录',url:'',private:false})
 expect(m.closed).toHaveLength(1);expect(m.restore()).toMatchObject({page:'downloads',title:'下载内容',url:''})
 expect(m.history[0]).not.toHaveProperty('page');expect(m.bookmarks[0]).not.toHaveProperty('page')
})
