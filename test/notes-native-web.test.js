import {afterEach,expect,it,vi} from 'vitest'
import {createRequire} from 'node:module'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
const require=createRequire(import.meta.url),React=require('react'),{createRoot}=require('react-dom/client'),close=[]
afterEach(async()=>{for(const fn of close.splice(0))await fn()})
it('loads a note link through the research native browser, reports its source and clips interaction to the note viewport',async()=>{
 const url='https://example.com/note',inspection={url,title:'已加载的网页',sourceText:'来自所引网页的正文',scrollWidth:700,clientWidth:700},updateNative=vi.fn(async()=>({loading:false,snapshotPending:false,imageRevision:1,inspection})),bridge={resolveEngine:async()=>({engine:'native'}),updateNative,hideNative:async()=>{},release:async()=>{}}
 const f=await financialClientFixture({researchLinkFrame:bridge},{notes:true}),section=f.document.createElement('section');section.className='en-root';section.innerHTML='<div class="en-document-scroll"><section class="en-research" data-research-node-id="note-web" data-selected="true"><header id="note-title"></header><div id="note-host" class="en-native-component-host" data-note-component="note-web" data-note-session="notes-test" style="height:300px"></div></section></div>';f.document.body.append(section)
 const viewport=section.querySelector('.en-document-scroll'),host=section.querySelector('#note-host'),card=host.parentElement
 viewport.getBoundingClientRect=()=>({left:100,top:100,right:800,bottom:600,width:700,height:500});f.document.elementFromPoint=()=>card
 const nativeBounds=f.win.HTMLElement.prototype.getBoundingClientRect;f.win.HTMLElement.prototype.getBoundingClientRect=function(){return this.hasAttribute('data-research-native-web')?{left:100,top:150,right:800,bottom:450,width:700,height:300}:nativeBounds.call(this)}
 const outlet=f.document.createElement('div');f.document.body.append(outlet);const root=createRoot(outlet),actions=[];f.document.addEventListener('sherlock:notes-component-action',e=>actions.push(e.detail));close.push(async()=>{await f.act(async()=>root.unmount());await f.dispose()})
 await f.act(async()=>{root.render(React.createElement(f.bundle.EWorkNoteComponentViews,{sessionId:'notes-test',active:true}));f.document.dispatchEvent(new f.win.CustomEvent('sherlock:notes-component-view',{detail:{instanceId:'web-instance',hostId:'note-host',headerId:'note-title',sessionId:'notes-test',node:{id:'note-web',kind:'web-link',title:'example.com',url,noteLibrary:true},dark:true}}));await new Promise(r=>setTimeout(r,40))})
 await expect.poll(()=>updateNative.mock.calls.length).toBeGreaterThan(0)
 expect(updateNative.mock.calls[0][0]).toMatchObject({sessionId:'notes-test',nodeId:'note-web',url,bounds:{x:100,y:150,width:700,height:300},active:true})
 expect(actions.find(a=>a.action==='web-inspection')).toMatchObject({url,inspection})
 expect(section.querySelector('[data-research-native-web]')).toBeTruthy();expect(section.querySelector('[role=alert]')).toBeNull()
},15000)
