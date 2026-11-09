import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {installDefaultWebLinks} from '../scripts/lib/default-web-links-client.mjs'
let dispose,win
afterEach(async()=>{dispose?.();dispose=undefined;await win?.happyDOM.abort()})
function setup(current='session-1'){
 win=new Window({url:'http://127.0.0.1:5000/'});let receive
 const openSource=vi.fn(async()=>({status:'opened'})),snapshot={current},sessions={list:{getSnapshot:()=>snapshot},create:vi.fn(async()=>{snapshot.current='created';return 'created'}),open:vi.fn()}
 const bridge={openSource,subscribe:fn=>{receive=fn;return vi.fn()}}
 dispose=installDefaultWebLinks({bridge,sessions,documentTarget:win.document})
 return {openSource,sessions,receive:value=>receive(value)}
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}
it('opens app links on the initial home without creating or switching a conversation',async()=>{
 const f=setup(),appOpen=vi.fn(async()=>{});f.sessions.list.getSnapshot().current=undefined;win.dshDesktop={browserApp:{openSource:appOpen}}
 f.receive({request:'open-link',url:'https://example.com/a'});await flush()
 expect(appOpen).toHaveBeenCalledExactlyOnceWith({url:'https://example.com/a'});expect(f.sessions.create).not.toHaveBeenCalled();expect(f.sessions.open).not.toHaveBeenCalled();expect(f.openSource).not.toHaveBeenCalled()
})
it('opens ordinary, keyboard-equivalent and blank-target links in the current right browser',async()=>{
 const f=setup();win.document.body.innerHTML='<a href="https://example.com/a" target="_blank"><span>网页</span></a>'
 const event=new win.MouseEvent('click',{bubbles:true,cancelable:true,button:0});win.document.querySelector('span').dispatchEvent(event);await flush()
 expect(event.defaultPrevented).toBe(true);expect(f.openSource).toHaveBeenCalledExactlyOnceWith({sessionId:'session-1',url:'https://example.com/a'})
 f.receive({request:'open-link',url:'https://example.com/b'});await flush()
 expect(f.openSource).toHaveBeenLastCalledWith({sessionId:'session-1',url:'https://example.com/b'})
})
it('preserves shell routes, file mentions, editor-handled links, downloads and non-web protocols',async()=>{
 const f=setup()
 for(const [href,download,handled]of [['/settings',false,false],['mailto:a@example.com',false,false],['file:///tmp/a',false,false],['javascript:alert(1)',false,false],['https://example.com/a',true,false],['https://example.com/a',false,true]]){
  const a=win.document.createElement('a');a.href=href;if(download)a.download='file';win.document.body.append(a)
  const event=new win.MouseEvent('click',{bubbles:true,cancelable:true,button:0});if(handled)event.preventDefault();a.dispatchEvent(event)
 }
 await flush();expect(f.openSource).not.toHaveBeenCalled()
})
it('creates one empty session for initial-home links and removes all listeners on disposal',async()=>{
 const f=setup(undefined);f.sessions.list.getSnapshot().current=undefined
 f.receive({request:'open-link',url:'https://example.com/a'});f.receive({request:'open-link',url:'https://example.com/b'});await flush();await flush()
 expect(f.sessions.create).toHaveBeenCalledTimes(1)
 expect(f.openSource.mock.calls.map(([v])=>v.sessionId)).toEqual(['created','created'])
 dispose();f.openSource.mockClear();f.receive({request:'open-link',url:'https://example.com/c'});await flush();expect(f.openSource).not.toHaveBeenCalled()
})
it('shows a bounded local error without falling back to the desktop browser',async()=>{
 const f=setup(),external=vi.fn();win.open=external;f.openSource.mockRejectedValue(Error('network unavailable'))
 f.receive({request:'open-link',url:'https://example.com/a'});await flush();await flush()
 expect(win.document.querySelector('[data-ework-web-link-error]')?.textContent).toMatch(/网页|page/)
 expect(external).not.toHaveBeenCalled()
})
