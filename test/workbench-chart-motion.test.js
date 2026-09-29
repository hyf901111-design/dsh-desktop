import {it,expect,vi} from 'vitest'
import {Window} from 'happy-dom'
import {installWorkbenchChartMotion} from '../packages/dsh-research-task-runtime/workbench-chart-motion.js'
const tick=()=>new Promise(resolve=>setTimeout(resolve,40))
function fixture(reduced=false){
 const win=new Window(),doc=win.document,media={matches:reduced,addEventListener:vi.fn((_,f)=>media.change=f),removeEventListener:vi.fn()};win.matchMedia=()=>media;Object.defineProperty(win,'IntersectionObserver',{value:undefined})
 doc.body.innerHTML='<div class="market-trend"><svg width="400" height="200"><line class="trend-grid"/><polyline class="trend-line" fill="none" stroke="blue" style="fill:none;stroke:blue;stroke-dasharray:none" points="0,20 100,10"/><rect class="price-volume-bar" width="20" height="30"/><g data-scatter-point="0"><circle r="5"/></g></svg></div><canvas width="400" height="200"></canvas>'
 const calls=[],animations=[]
 const prepare=()=>{for(const el of doc.querySelectorAll('*')){el.getBoundingClientRect=()=>({width:400,height:200});el.getTotalLength=()=>100;el.animate=(frames,options)=>{calls.push({el,frames,options});let done;const animation={finished:new Promise(resolve=>done=resolve),cancel:vi.fn(()=>done()),finish:()=>done()};animations.push(animation);return animation}}}
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
it('CSS资金流、漏斗、风险、广度、基金及甘特图都生长，标签及真实宽度保持',async()=>{
 const f=fixture()
 try{const surface=f.doc.createElement('section');surface.innerHTML='<div class="fund-flow-bars"><span class="fund-flow-axis"><i style="width:50%"></i><i style="width:80%"></i></span><span>真实资金</span></div><div class="funnel-stage-list"><i class="funnel-bar" style="width:60%"></i><span>转化率</span></div><div class="risk-grid"><button class="risk-cell">3</button><span>概率轴</span></div><div class="market-bar"><i style="flex:2"></i><i style="flex:1"></i><i style="flex:3"></i></div><div class="fund-industries"><span class="fund-bar" style="width:83%"></span></div><div class="gantt-rows"><span class="gantt-bar" style="left:20%;width:50%"></span></div>';f.doc.body.append(surface);f.prepare();await tick();const css=f.calls.filter(c=>surface.contains(c.el));expect(css).toHaveLength(9);expect(css[0].frames[0].transformOrigin).toBe('right center');expect(css[1].frames[0].transformOrigin).toBe('left center');expect(css[2].frames[0].transform).toContain('scaleX');for(const a of f.animations)a.finish();await tick();expect(surface.querySelector('.funnel-bar').style.width).toBe('60%');expect(surface.querySelector('.gantt-bar').style.left).toBe('20%');expect(surface.querySelector('.fund-bar').style.width).toBe('83%');expect(css.every(c=>c.el.textContent!=='概率轴'&&c.el.textContent!=='转化率')).toBe(true)}finally{await f.dispose()}
})
it('减少动态效果直接显示完整图表，运行中开启则立即结束动效',async()=>{
 const f=fixture(true)
 try{await tick();expect(f.calls).toHaveLength(0)}finally{await f.dispose()}
 const moving=fixture()
 try{await tick();expect(moving.animations.length).toBeGreaterThan(0);moving.media.matches=true;moving.media.change();expect(moving.animations.every(a=>a.cancel.mock.calls.length===1)).toBe(true);await tick();expect(moving.doc.querySelector('[style*="transform-box"]')).toBeNull()}finally{await moving.dispose()}
})

it('横条沿数轴展开，负值柱从零线向下生长，辅助光标不参与动效',async()=>{
 const f=fixture()
 try{
  const card=f.doc.createElement('section');card.innerHTML='<svg><line class="chart-cursor"/><rect data-grow-axis="x" data-grow-origin="left center" width="80" height="12"/><rect data-grow-origin="center top" width="12" height="80"/><line class="plot-stem" style="fill:none;stroke:blue;stroke-dasharray:none"/></svg>';f.doc.body.append(card);f.prepare();await tick();
  const calls=f.calls.filter(c=>card.contains(c.el));expect(calls).toHaveLength(3);expect(calls[0].frames[0]).toMatchObject({transform:expect.stringContaining('scaleX(.001)'),transformOrigin:'left center'});expect(calls[1].frames[0]).toMatchObject({transform:expect.stringContaining('scaleY(.001)'),transformOrigin:'center top'});expect(calls[2].frames[0].strokeDashoffset).toBe(100);
 }finally{await f.dispose()}
})
