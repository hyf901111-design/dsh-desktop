import {afterEach,expect,it,vi} from 'vitest'
import {createRequire} from 'node:module'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
const require=createRequire(import.meta.url),React=require('react'),{createRoot}=require('react-dom/client'),close=[]
afterEach(async()=>{for(const fn of close.splice(0))await fn()})

it('mounts the original research controls in note hosts, acknowledges cloned changes and positions index settings from the component header',async()=>{
 const symbol={code:'600519',market:'SH',name:'验收标的'},bridge={request:vi.fn(async v=>v.action==='search'?{symbols:[symbol]}:{quotes:(v.symbols||[]).map(s=>({...s,price:100,changePercent:1})),source:'验证来源'})}
 const f=await financialClientFixture({financialWidget:bridge},{notes:true}),section=f.document.createElement('section');section.className='en-root';f.document.body.append(section)
 const outlet=f.document.createElement('div');f.document.body.append(outlet);const viewer=createRoot(outlet),entries=new Map(),actions=[]
 const publish=entry=>{entries.set(entry.instanceId,entry);f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-view',{detail:structuredClone(entry)}))}
 const make=(id,widget)=>{const spec=financialWidgetDefaults(widget);section.insertAdjacentHTML('beforeend',`<section class="en-research" data-research-node-id="${id}"><header id="title-${id}"></header><div id="${id}" class="en-native-component-host" data-note-component="${id}" data-note-session="notes-test"></div></section>`);return {instanceId:id,hostId:id,headerId:'title-'+id,sessionId:'notes-test',node:{id,title:spec.title,containerSpec:spec,noteLibrary:true},dark:true,refresh:0}}
 const change=event=>{const value=structuredClone(event.detail);if(value.action!=='spec')return;actions.push(value);const entry=entries.get(value.instanceId);publish({...entry,node:{...entry.node,containerSpec:value.next}});f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:value.instanceId,sessionId:value.sessionId,requestId:value.requestId,ok:true}}))}
 f.document.addEventListener('sherlock:notes-component-action',change)
 close.push(async()=>{f.document.removeEventListener('sherlock:notes-component-action',change);await f.act(async()=>viewer.unmount());await f.dispose()})
 await f.act(async()=>{viewer.render(React.createElement(f.bundle.EWorkNoteComponentViews,{sessionId:'notes-test',active:true}));publish(make('watch','watchlist'));publish(make('index','indices'));publish(make('quote','quote'))})
 await f.event('click',section.querySelector('#watch [aria-label="添加自选股"]'))
 const search=section.querySelector('#watch input');await f.input(search,'600519');await f.act(async()=>{await new Promise(resolve=>setTimeout(resolve,260))});expect(f.document.querySelector('.ew-financial-suggestions [role=option]')).toBeTruthy()
 await f.event('click',f.document.querySelector('.ew-financial-suggestions [role=option]'))
 expect(actions.at(-1).next.symbols).toEqual([symbol]);expect(section.querySelector('#watch input')).toBeNull();expect(section.querySelector('#watch [data-stock-code="600519"]')).toBeTruthy()
 await f.event('click',section.querySelector('#title-index [aria-label="配置指数"]'))
 const dialog=f.document.querySelector('[aria-label="配置指数"][role=dialog]');expect(dialog).toBeTruthy();expect(dialog.style.visibility).toBe('visible');expect(Number.parseFloat(dialog.style.width)).toBeGreaterThan(0)
 const apply=[...dialog.querySelectorAll('button')].find(button=>button.textContent==='应用'||button.textContent==='保存');expect(apply).toBeTruthy();await f.event('click',apply)
 expect(actions.at(-1).instanceId).toBe('index');expect(f.document.querySelector('[aria-label="配置指数"][role=dialog]')).toBeNull()
 expect(section.querySelector('#title-quote .ew-financial-header-selector')).toBeTruthy()
 expect(section.querySelector('[role=alert]')).toBeNull()
},15000)
