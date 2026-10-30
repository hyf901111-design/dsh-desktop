// @vitest-environment happy-dom
import {afterEach,expect,it} from 'vitest'
import {revealHomeNotesGuideSummary} from '../scripts/lib/home-guide-notes-native.mjs'
afterEach(()=>{document.body.innerHTML=''})
it('reveals the complete compact preview card within its original message scroller',async()=>{
 document.body.innerHTML='<section data-research-conversation-panel><div class="sRp_messages"><section data-note-result-preview><button>添加</button></section></div><div data-research-composer-host><textarea></textarea></div></section>'
 const scroll=document.querySelector('.sRp_messages'),card=scroll.firstElementChild,button=card.firstElementChild,composer=document.querySelector('[data-research-composer-host]'),input=composer.firstElementChild
 const rect=(top,bottom)=>({top,bottom,left:0,right:320,width:320,height:bottom-top})
 scroll.getBoundingClientRect=()=>rect(20,500);composer.getBoundingClientRect=()=>rect(500,680)
 card.getBoundingClientRect=()=>rect(800-scroll.scrollTop,1100-scroll.scrollTop);button.getBoundingClientRect=()=>rect(1060-scroll.scrollTop,1080-scroll.scrollTop)
 scroll.scrollTo=({top})=>{scroll.scrollTop=top}
 await revealHomeNotesGuideSummary({document,window,button,input,check:()=>{},until:async read=>{for(let n=0;n<5;n++){const result=read();if(result)return result}throw Error('not visible')},valid:()=>{expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(500)}})
 expect(card.getBoundingClientRect().bottom).toBeLessThanOrEqual(500)
 expect(card.getBoundingClientRect().top).toBeGreaterThanOrEqual(20)
 expect(document.documentElement.scrollTop).toBe(0)
})
