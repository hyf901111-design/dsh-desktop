import { it, expect } from 'vitest'
import {componentWheelZoom, componentWheelPan} from '../scripts/lib/component-wheel-zoom.mjs'
const data={type:'sherlock-content-zoom',x:.25,y:.5,deltaX:0,deltaY:120,ctrlKey:false}
it('maps scaled child pointer coordinates into the parent canvas',()=>{
 expect(componentWheelZoom(data,{left:100,top:200,width:400,height:300})).toMatchObject({clientX:200,clientY:350,metaKey:true,deltaY:120,bubbles:true})
})
it.each([{...data,x:-1},{...data,deltaY:NaN},{...data,ctrlKey:'true'},{...data,extra:1}])('rejects malformed iframe wheel messages', bad=>{
 expect(componentWheelZoom(bad,{})).toBeNull()
})
it('maps unmodified wheel from a non-scrolling component into canvas coordinates',()=>{
 const pan={type:'sherlock-content-pan',x:.25,y:.5,deltaX:0,deltaY:120}
 expect(componentWheelPan(pan,{left:100,top:200,width:400,height:300})).toMatchObject({clientX:200,clientY:350,metaKey:false,deltaY:120,bubbles:true})
 expect(componentWheelPan({...pan,ctrlKey:true},{})).toBeNull()
})
