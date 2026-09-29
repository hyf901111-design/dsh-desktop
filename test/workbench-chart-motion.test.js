import {it,expect,vi} from 'vitest'
import {Window} from 'happy-dom'
import {installWorkbenchChartMotion} from '../packages/dsh-research-task-runtime/workbench-chart-motion.js'
const tick=()=>new Promise(resolve=>setTimeout(resolve,40))
function fixture(reduced=false){
 const win=new Window(),doc=win.document,media={matches:reduced,addEventListener:vi.fn((_,f)=>media.change=f),removeEventListener:vi.fn()};win.matchMedia=()=>media;Object.defineProperty(win,'IntersectionObserver',{value:undefined})
 doc.body.innerHTML='<div class="market-trend"><svg width="400" height="200"><line class="trend-grid"/><polyline class="trend-line" fill="none" stroke="blue" style="fill:none;stroke:blue;stroke-dasharray:none" points="0,20 100,10"/><rect class="price-volume-bar" width="20" height="30"/><g data-scatter-point="0"><circle r="5"/></g></svg></div><canvas width="400" height="200"></canvas>'
 const calls=[],animations=[]
 const prepare=()=>{for(const el of doc.querySelectorAll('svg,svg *,canvas')){el.getBoundingClientRect=()=>({width:400,height:200});el.getTotalLength=()=>100;el.animate=(frames,options)=>{calls.push({el,frames,options});let done;const animation={finished:new Promise(resolve=>done=resolve),cancel:vi.fn(()=>done()),finish:()=>done()};animations.push(animation);return animation}}}
 prepare();const stop=installWorkbenchChartMotion(doc.documentElement)
 return{win,doc,media,calls,animations,prepare,stop,dispose:async()=>{stop();await win.happyDOM.abort()}}
}
it('首次加载绘制数据标记，保留坐标轴、图形属性和原始最终布局',async()=>{
 const f=fixture(),before=f.doc.querySelector('svg').outerHTML
 try{await tick();expect(f.calls.map(c=>c.el.tagName.toLowerCase())).toEqual(['polyline','rect','g','canvas']);expect(f.calls[0].frames[0].strokeDashoffset).toBe(100);expect(f.calls[1].frames[0].transform).toContain('scaleY');expect(f.calls[2].frames[0].transform).toContain('scale(.3)');expect(f.calls[3].frames[0].clipPath).toBe('inset(100% 0 0 0)');for(const a of f.animations)a.finish();await tick();expect(f.doc.querySelector('svg').outerHTML.replace(/ style=""/g,'')).toBe(before)}finally{await f.dispose()}
})
it('主题、悬停及筛选重绘不重播，同一图表替换SVG仍只播放一次',async()=>{
 const f=fixture()
 try{await tick();const count=f.calls.length;f.win.dispatchEvent(new f.win.Event('sherlock-theme-change'));f.doc.querySelector('svg').setAttribute('data-selected-index','1');const old=f.doc.querySelector('svg');old.replaceWith(old.cloneNode(true));f.prepare();await tick();expect(f.calls).toHaveLength(count)}finally{await f.dispose()}
})
it('减少动态效果直接显示完整图表，运行中开启则立即结束动效',async()=>{
 const f=fixture(true)
 try{await tick();expect(f.calls).toHaveLength(0)}finally{await f.dispose()}
 const moving=fixture()
 try{await tick();expect(moving.animations.length).toBeGreaterThan(0);moving.media.matches=true;moving.media.change();expect(moving.animations.every(a=>a.cancel.mock.calls.length===1)).toBe(true);await tick();expect(moving.doc.querySelector('[style*="transform-box"]')).toBeNull()}finally{await moving.dispose()}
})
