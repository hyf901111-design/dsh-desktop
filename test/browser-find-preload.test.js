import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
it('keeps IME composition local, restores a reopened query and emits only find actions',async()=>{
 const w=new Window(),sent=[],handlers=new Map(),ipc={send:(...value)=>sent.push(value),on:(name,fn)=>handlers.set(name,fn)}
 vm.runInNewContext(readFileSync('src/preload/browser/find-preload.cjs','utf8'),{require:name=>{expect(name).toBe('electron');return {ipcRenderer:ipc}},window:w,document:w.document})
 w.dispatchEvent(new w.Event('DOMContentLoaded'));const input=w.document.querySelector('input');expect(sent).toEqual([['browser-app:find-action',{kind:'ready'}]])
 input.focus();input.dispatchEvent(new w.Event('compositionstart'));input.value='中文';input.dispatchEvent(new w.Event('input'));expect(sent).toHaveLength(1);input.dispatchEvent(new w.Event('compositionend'));expect(sent.at(-1)[1]).toEqual({kind:'input',text:'中文'})
 handlers.get('browser-app:find-state')({}, {reset:true,text:'Reopened',dark:true,find:{matches:3,activeMatchOrdinal:2}});expect(input.value).toBe('Reopened');expect(w.document.querySelector('small').textContent).toBe('2 / 3')
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));expect(sent.at(-1)[1]).toEqual({kind:'next',text:'Reopened',forward:false})
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(sent.at(-1)[1]).toEqual({kind:'close'});await w.happyDOM.abort()
})
