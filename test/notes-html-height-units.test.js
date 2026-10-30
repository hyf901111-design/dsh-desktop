// @vitest-environment happy-dom
import {expect,it} from 'vitest'
import {runInNewContext} from 'node:vm'
import {EWorkNoteComponentView} from '../scripts/lib/notes-components.mjs'
function fixture({cardHeight=354,hostHeight=320,frameHeight=300,scale=1}={}){
 document.body.innerHTML='<main class="en-root"><section class="en-research" data-research-node-id="unit"><header></header><div class="en-native-component-host"><iframe class="rScV5Q_webFrame"></iframe></div></section></main>'
 const host=document.querySelector('.en-native-component-host'),card=host.parentElement,frame=host.querySelector('iframe'),actions=[];let props
 for(const [node,name,value] of [[host,'offsetHeight',hostHeight],[card,'offsetHeight',cardHeight],[frame,'clientHeight',frameHeight]])Object.defineProperty(node,name,{value,configurable:true})
 card.style.transform='scale('+scale+')';card.getBoundingClientRect=()=>({height:cardHeight*scale});host.getBoundingClientRect=()=>({height:hostHeight*scale})
 const bridge={subscribe:()=>()=>{},snapshot:()=>({}),observe:()=>{},dispose:()=>{}}
 const react={useRef:current=>({current}),useState:value=>[value,()=>{}],useSyncExternalStore:()=>undefined,useCallback:fn=>fn,useEffect:()=>{},useLayoutEffect:()=>{},useMemo:fn=>fn(),createElement:(type,input,...children)=>{if(type==='ResearchContainerBody')props=input;return{type,input,children}},Fragment:'Fragment'}
 const receive=event=>actions.push(event.detail);document.addEventListener('sherlock:notes-component-action',receive)
 const invoke=runInNewContext('('+EWorkNoteComponentView.toString()+')',{react,react_dom:{createPortal:node=>node},document,CustomEvent,Map,Set,setTimeout,clearTimeout,componentDataStatusStore:{},componentRssStatusView:()=>{},workbenchRefreshState:()=>null,eworkCreateNoteHtmlInteraction:()=>bridge,eworkCreateNoteHtmlSharedState:()=>bridge,eworkNoteHtmlInteractionContext:{Provider:'provider'},ResearchContainerBody:'ResearchContainerBody'})
 invoke({entry:{host,header:card.querySelector('header'),instanceId:'unit-instance',sessionId:'unit-session',node:{id:'unit',title:'Height',containerSpec:{type:'html',html:'test'}}}})
 return{host,card,frame,actions,size:height=>props.onHtmlSize('unit',{height}),close:()=>document.removeEventListener('sherlock:notes-component-action',receive)}
}
it.each([.8,1,1.25])('converts outer CSS height into host height at screen scale %s without consuming host-internal chrome',scale=>{
 const f=fixture({scale});try{f.size(400);expect(f.actions).toHaveLength(1);expect(f.actions[0]).toMatchObject({action:'size',height:366,sessionId:'unit-session',instanceId:'unit-instance'});expect(f.actions[0].height-300).toBe(66)}finally{f.close()}
})
it.each(['zero-frame','zero-host','zero-card','missing','foreign','nonfinite','below-chrome'])('rejects an unmeasured or foreign %s instead of publishing a speculative size',invalid=>{
 const f=fixture();try{if(invalid==='missing')f.frame.remove();if(invalid==='foreign'){const other=document.createElement('section');other.dataset.researchNodeId='other';f.host.append(other);other.append(f.frame)}if(invalid==='zero-frame')Object.defineProperty(f.frame,'clientHeight',{value:0});if(invalid==='zero-host')Object.defineProperty(f.host,'offsetHeight',{value:0});if(invalid==='zero-card')Object.defineProperty(f.card,'offsetHeight',{value:0});expect(f.size(invalid==='nonfinite'?NaN:invalid==='below-chrome'?20:400)).toBe(false);expect(f.actions).toEqual([])}finally{f.close()}
})
it('accepts zero external chrome when the title bar is hidden',()=>{const f=fixture({cardHeight:320});try{f.size(400);expect(f.actions[0].height).toBe(400)}finally{f.close()}})
