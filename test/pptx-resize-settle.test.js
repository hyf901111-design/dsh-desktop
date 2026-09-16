import {it,expect,vi} from 'vitest'
import {schedulePptxResize,cancelPptxResize} from '../scripts/lib/pptx-resize-settle.mjs'
it('coalesces continuous width changes into one final render and cancels on destruction',()=>{
 vi.useFakeTimers();const viewer={queueRender:vi.fn(),presentation:{},container:{clientWidth:500}}
 for(let i=0;i<40;i++){viewer.container.clientWidth=500+i;schedulePptxResize(viewer);vi.advanceTimersByTime(16)}
 expect(viewer.queueRender).not.toHaveBeenCalled();vi.advanceTimersByTime(180);expect(viewer.queueRender).toHaveBeenCalledOnce()
 schedulePptxResize(viewer);cancelPptxResize(viewer);vi.runAllTimers();expect(viewer.queueRender).toHaveBeenCalledOnce();vi.useRealTimers()
})

it('resizes list slides in place without blanking or rebuilding, including unmounted placeholders',()=>{
 const slide={style:{},identity:'original'}
 const wrapper={style:{},firstElementChild:slide}
 const placeholder={style:{},firstElementChild:null}
 const viewer={presentation:{},activeRenderMode:'list',queueRender:vi.fn(),container:{querySelectorAll:()=>[{firstElementChild:wrapper},{firstElementChild:placeholder}]},getDisplayMetrics:()=>({scale:0.5,displayWidth:480,displayHeight:270})}
 for(let i=0;i<40;i++)schedulePptxResize(viewer)
 expect(viewer.queueRender).not.toHaveBeenCalled()
 expect(wrapper.firstElementChild).toBe(slide)
 expect(slide.style.transform).toBe('scale(0.5)')
 expect(wrapper.style.width).toBe('480px')
 expect(placeholder.style.height).toBe('270px')
})
