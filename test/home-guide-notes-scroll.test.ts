// @vitest-environment happy-dom
import {afterEach,expect,it} from 'vitest'
import {returnHomeNotesToTop} from '../src/preload/home-guide-notes-scroll'
afterEach(()=>{document.body.innerHTML=''})
it('returns the same note scroll area to its title with acceleration and deceleration',async()=>{
 const area=document.createElement('div');document.body.append(area);area.scrollTop=900;area.style.scrollBehavior='smooth'
 const samples:number[]=[]
 await returnHomeNotesToTop(area,{signal:new AbortController().signal,reducedMotion:false,wait:async()=>{samples.push(area.scrollTop)}})
 expect(area.isConnected).toBe(true);expect(area.scrollTop).toBe(0);expect(area.style.scrollBehavior).toBe('smooth')
 expect(samples.length).toBeGreaterThan(35)
 expect(samples.every((value,index)=>index===0||value<=samples[index-1]!)).toBe(true)
 const movement=samples.slice(1).map((value,index)=>samples[index]!-value),mid=Math.floor(movement.length/2)
 expect(movement[mid]).toBeGreaterThan(movement[1]!*8);expect(movement[mid]).toBeGreaterThan(movement.at(-2)!*8)
})
it('does not move the note after its run is cancelled',async()=>{
 const area=document.createElement('div');document.body.append(area);area.scrollTop=600
 const abort=new AbortController();let count=0,last=0
 await expect(returnHomeNotesToTop(area,{signal:abort.signal,reducedMotion:false,wait:async()=>{if(++count===5){last=area.scrollTop;abort.abort()}}})).rejects.toMatchObject({name:'AbortError'})
 expect(area.scrollTop).toBe(last);expect(area.style.scrollBehavior).toBe('')
})
