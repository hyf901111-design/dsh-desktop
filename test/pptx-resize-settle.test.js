import {it,expect,vi} from 'vitest'
import {schedulePptxResize,cancelPptxResize} from '../scripts/lib/pptx-resize-settle.mjs'
it('coalesces continuous width changes into one final render and cancels on destruction',()=>{
 vi.useFakeTimers();const viewer={queueRender:vi.fn(),presentation:{},container:{clientWidth:500}}
 for(let i=0;i<40;i++){viewer.container.clientWidth=500+i;schedulePptxResize(viewer);vi.advanceTimersByTime(16)}
 expect(viewer.queueRender).not.toHaveBeenCalled();vi.advanceTimersByTime(180);expect(viewer.queueRender).toHaveBeenCalledOnce()
 schedulePptxResize(viewer);cancelPptxResize(viewer);vi.runAllTimers();expect(viewer.queueRender).toHaveBeenCalledOnce();vi.useRealTimers()
})
