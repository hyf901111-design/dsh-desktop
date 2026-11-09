import {afterEach,expect,it} from 'vitest'
import {Window} from 'happy-dom'
import {EventEmitter} from 'node:events'
import {createBrowserPageAgent,type BrowserPageTarget} from '../src/main/browser/page-agent'

const windows:Window[]=[]
afterEach(async()=>{await Promise.all(windows.splice(0).map(w=>w.happyDOM.abort()))})
function page(html='<h1>Research</h1><p>Read <a href="/next"><strong>the report</strong></a> today.</p>'){
 const w=new Window({url:'https://page.example.test/article',width:900,height:700});windows.push(w)
 w.document.body.innerHTML=html
 // happy-dom has no layout. All security/patch logic below still runs in its DOM;
 // the separate native fixture exercises Chromium's actual layout and WebContents.
 w.HTMLElement.prototype.getBoundingClientRect=function(){return new w.DOMRect(0,0,300,30)}
 const wc=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isLoadingMainFrame:()=>false,getURL:()=>w.location.href,getTitle:()=>w.document.title,executeJavaScriptInIsolatedWorld:async(_world:number,scripts:{code:string}[])=>w.eval(scripts[0]!.code),navigationHistory:{canGoBack:()=>false,goBack(){}},sendInputEvent(){}})
 const target={tabId:'tab-A',url:w.location.href,title:'Article',webContents:wc} as unknown as BrowserPageTarget
 let active:BrowserPageTarget|undefined=target
 const agent=createBrowserPageAgent(()=>active)
 return {w,wc,target,agent,setActive:(v:BrowserPageTarget|undefined)=>{active=v}}
}
const scope=(ob:any)=>({tabId:ob.tabId,url:ob.url,revision:ob.revision,documentRevision:ob.documentRevision})

it('edits observed text nodes atomically while preserving links and supports one undo',async()=>{
 const {w,agent}=page(),ob=(await agent.run({op:'observe'})).observation
 const heading=ob.textNodes.find((n:any)=>n.text==='Research')!,link=ob.textNodes.find((n:any)=>n.text==='the report')!
 const before=w.document.querySelector('a')!,markup=before.innerHTML
 const edited=await agent.run({op:'edit',...scope(ob),patches:[{ref:heading.ref,expectedText:'Research',replacementText:'研究'},{ref:link.ref,expectedText:'the report',replacementText:'报告'}]})
 expect(w.document.querySelector('h1')!.textContent).toBe('研究')
 expect(w.document.querySelector('a')).toBe(before);expect(before.getAttribute('href')).toBe('/next');expect(before.firstElementChild!.tagName).toBe('STRONG')
 expect(edited.edit).toEqual({changed:2,localOnly:true});expect(edited.observation.canUndo).toBe(true)
 const undone=await agent.run({op:'undo',...scope(edited.observation)})
 expect(before.innerHTML).toBe(markup);expect(w.document.querySelector('h1')!.textContent).toBe('Research');expect(undone.observation.canUndo).toBe(false)
 await expect(agent.run({op:'undo',...scope(undone.observation)})).rejects.toThrow()
})

it('does not expose or edit hidden content, scripts, credentials, forms or arbitrary attributes',async()=>{
 const {w,agent}=page('<h1>Article</h1><div hidden>secret hidden</div><div style="display:none">secret style</div><input type=password value="password-secret"><textarea>draft-secret</textarea><div contenteditable=true>editor-secret</div><script>script-secret</script><a href="/kept">Public link</a>')
 const ob=(await agent.run({op:'observe'})).observation
 expect(ob.text).toContain('Article');expect(ob.text).toContain('Public link')
 for(const secret of ['secret hidden','secret style','password-secret','draft-secret','editor-secret','script-secret'])expect(JSON.stringify(ob)).not.toContain(secret)
 const node=ob.textNodes.find((n:any)=>n.text==='Article')!
 for(const extra of [{html:'<img src=x onerror=alert(1)>'},{attribute:'href',value:'https://evil.test'},{style:{display:'none'}}])await expect(agent.run({op:'edit',...scope(ob),patches:[{ref:node.ref,expectedText:node.text,replacementText:'Changed',...extra}]})).rejects.toThrow()
 const result=await agent.run({op:'edit',...scope(ob),patches:[{ref:node.ref,expectedText:node.text,replacementText:'<img src=x onerror=alert(1)>'}]})
 expect(w.document.querySelector('h1')!.textContent).toBe('<img src=x onerror=alert(1)>');expect(w.document.querySelector('img')).toBeNull();expect(result.edit!.localOnly).toBe(true)
})

it('rejects stale pages and compare-and-swap conflicts before changing any text',async()=>{
 const {w,wc,agent,target,setActive}=page(),ob=(await agent.run({op:'observe'})).observation
 const heading=ob.textNodes.find((n:any)=>n.text==='Research')!,link=ob.textNodes.find((n:any)=>n.text==='the report')!
 const edit={op:'edit',...scope(ob),patches:[{ref:heading.ref,expectedText:heading.text,replacementText:'研究'},{ref:link.ref,expectedText:'wrong',replacementText:'报告'}]}
 await expect(agent.run(edit)).rejects.toThrow();expect(w.document.querySelector('h1')!.textContent).toBe('Research')
 setActive({...target,tabId:'tab-B'});await expect(agent.run({...edit,patches:edit.patches.slice(0,1)})).rejects.toThrow();expect(w.document.querySelector('h1')!.textContent).toBe('Research')
 setActive(target);wc.emit('did-start-navigation',{},target.url,false,true)
 await expect(agent.run({...edit,patches:edit.patches.slice(0,1)})).rejects.toThrow();expect(w.document.querySelector('h1')!.textContent).toBe('Research')
})

it('fails closed for unavailable scope, aborted requests and payloads outside the finite API',async()=>{
 const {w,agent,setActive}=page(),ob=(await agent.run({op:'observe'})).observation,node=ob.textNodes[0]!
 const edit={op:'edit',...scope(ob),patches:[{ref:node.ref,expectedText:node.text,replacementText:'Changed'}]}
 const cancelled=new AbortController();cancelled.abort();await expect(agent.run(edit,cancelled.signal)).rejects.toThrow()
 for(const invalid of [{...edit,tabId:'foreign'},{...edit,url:'https://other.test/'},{...edit,patches:[]},{...edit,patches:[{ref:node.ref,expectedText:node.text,replacementText:'a'.repeat(8001)}]},{op:'evaluate',code:'document.body.remove()'}])await expect(agent.run(invalid)).rejects.toThrow()
 expect(w.document.querySelector('h1')!.textContent).toBe('Research')
 setActive(undefined);expect(await agent.context()).toBeUndefined();await expect(agent.run({op:'observe'})).rejects.toThrow()
})

it('does not overwrite subsequent website changes during undo',async()=>{
 const {w,agent}=page(),ob=(await agent.run({op:'observe'})).observation,node=ob.textNodes.find((n:any)=>n.text==='Research')!
 await agent.run({op:'edit',...scope(ob),patches:[{ref:node.ref,expectedText:node.text,replacementText:'研究'}]})
 w.document.querySelector('h1')!.firstChild!.textContent='Live update'
 const latest=await agent.context();await expect(agent.run({op:'undo',...scope(latest)})).rejects.toThrow();expect(w.document.querySelector('h1')!.textContent).toBe('Live update')
})

it('restores the original document snapshot after several edit batches, including a repeated node',async()=>{
 const {w,agent}=page();let ob=(await agent.run({op:'observe'})).observation
 for(const [before,after]of [['Research','研究'],['the report','报告'],['研究','研究上下文']]){
  const node=ob.textNodes.find(n=>n.text===before)!
  ob=(await agent.run({op:'edit',...scope(ob),patches:[{ref:node.ref,expectedText:before,replacementText:after}]})).observation
 }
 const undone=await agent.run({op:'undo',...scope(ob)})
 expect(w.document.querySelector('h1')!.textContent).toBe('Research');expect(w.document.querySelector('a')!.textContent).toBe('the report');expect(undone.observation.canUndo).toBe(false)
})

it('does not absorb a website update into an older local undo snapshot',async()=>{
 const {w,agent}=page(),ob=(await agent.run({op:'observe'})).observation,node=ob.textNodes.find(n=>n.text==='Research')!
 await agent.run({op:'edit',...scope(ob),patches:[{ref:node.ref,expectedText:node.text,replacementText:'研究'}]})
 w.document.querySelector('h1')!.firstChild!.textContent='Website update'
 const latest=await agent.context(),changed=latest!.textNodes.find(n=>n.text==='Website update')!
 await expect(agent.run({op:'edit',...scope(latest),patches:[{ref:changed.ref,expectedText:changed.text,replacementText:'新修改'}]})).rejects.toThrow()
 expect(w.document.querySelector('h1')!.textContent).toBe('Website update')
})

it('paginates long pages without scrolling and still detects changes outside the current slice',async()=>{
 const {w,agent}=page(Array.from({length:1100},(_,i)=>'<p>Paragraph '+i+'</p>').join(''))
 const first=(await agent.run({op:'observe'})).observation
 expect(first.textNodes).toHaveLength(1000);expect(first.hasMoreText).toBe(true);expect(first.nextTextOffset).toBe(1000)
 const second=(await agent.run({op:'observe',textOffset:first.nextTextOffset})).observation
 expect(second.textNodes).toHaveLength(100);expect(second.textNodes[0]!.text).toBe('Paragraph 1000');expect(second.hasMoreText).toBe(false);expect(second.revision).toBe(first.revision)
 const node=second.textNodes[0]!,edited=await agent.run({op:'edit',...scope(second),patches:[{ref:node.ref,expectedText:node.text,replacementText:'第1000段'}]})
 expect(w.document.querySelectorAll('p')[1000]!.textContent).toBe('第1000段');expect(edited.observation.textOffset).toBe(1000)
 w.document.querySelector('p')!.firstChild!.textContent='Website update outside this slice'
 const next=edited.observation.textNodes[1]!
 await expect(agent.run({op:'edit',...scope(edited.observation),patches:[{ref:next.ref,expectedText:next.text,replacementText:'Changed'}]})).rejects.toThrow()
})

it('keeps character-limited text pages contiguous and enforces the 16 KiB bridge budget',async()=>{
 const {agent}=page(Array.from({length:9},(_,i)=>'<p>'+i+' '+('x'.repeat(6998))+'</p>').join('')+'<p>Tail paragraph</p>')
 const first=(await agent.run({op:'observe'})).observation,second=(await agent.run({op:'observe',textOffset:first.nextTextOffset})).observation
 expect(first.textNodes).toHaveLength(8);expect(first.nextTextOffset).toBe(8);expect(second.textNodes[0]!.text.startsWith('8 ')).toBe(true);expect(second.textNodes[1]!.text).toBe('Tail paragraph');expect(second.hasMoreText).toBe(false)
 const node=first.textNodes[0]!
 await expect(agent.run({op:'edit',...scope(first),patches:[{ref:node.ref,expectedText:node.text,replacementText:'中'.repeat(3000)}]})).rejects.toThrow(/批次|字节/)
})
