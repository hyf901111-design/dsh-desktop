import {Window} from 'happy-dom'
import {readFile} from 'node:fs/promises'
import {afterEach,expect,it} from 'vitest'
const cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0))await close()})
async function harness(){
 const w=new Window({url:'http://127.0.0.1:59560/'}),handlers=new Map(),events=[]
 w.menuRequire=()=>({ipcRenderer:{on:(name,fn)=>handlers.set(name,fn),send:(name,value)=>events.push({name,value})}})
 w.eval(`((require)=>{${await readFile('src/preload/browser/menu-preload.cjs','utf8')}\n})(window.menuRequire)`);w.dispatchEvent(new w.Event('DOMContentLoaded'))
 cleanup.push(async()=>w.happyDOM.abort())
 const emit=(name,value)=>handlers.get(name)?.({},value),state={id:'one',revision:2,_request:3,material:'menu',html:'<section role="menu" data-native-menu-root><button data-native-control="a" data-native-clickable>打开</button><button data-native-control="b" data-native-clickable>关闭</button></section>',reducedMotion:true}
 emit('browser-app:menu-state',state);events.length=0;return{w,events,emit,state}
}
it('routes a main/page key only to the current material menu active control and rejects stale scopes',async()=>{
 const f=await harness();f.emit('browser-app:menu-key',{...f.state,id:'old',key:'ArrowDown'});f.emit('browser-app:menu-key',{...f.state,_request:2,key:'ArrowDown'});f.emit('browser-app:menu-key',{...f.state,key:'q'});expect(f.events).toEqual([])
 f.emit('browser-app:menu-key',{id:'one',revision:2,_request:3,key:'ArrowDown',shiftKey:true});expect(f.events.map(event=>event.value)).toEqual([{id:'one',revision:2,_request:3,kind:'key',controlId:'a',key:'ArrowDown',shiftKey:true,metaKey:false,ctrlKey:false,altKey:false}])
 f.emit('browser-app:menu-clear',{_clear:9});f.events.length=0;f.emit('browser-app:menu-key',{id:'one',revision:2,_request:3,key:'Escape'});expect(f.events).toEqual([])
})
it('keeps mouse actions single and treats Space as activation without consuming text input spaces',async()=>{
 const f=await harness(),button=f.w.document.querySelector('button');button.click();expect(f.events.filter(event=>event.value.kind==='click')).toHaveLength(1);f.events.length=0;f.emit('browser-app:menu-key',{id:'one',revision:2,_request:3,key:' '});expect(f.events[0]?.value).toMatchObject({kind:'key',controlId:'a',key:' '})
 f.emit('browser-app:menu-state',{...f.state,id:'input-menu',material:undefined,html:'<section role="menu"><input data-native-control="query" value="a"></section>'});f.events.length=0;const input=f.w.document.querySelector('input'),event=new f.w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});input.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);expect(f.events).toEqual([])
})
