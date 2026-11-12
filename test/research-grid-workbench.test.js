import { describe, it, expect } from 'vitest'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createWorkbenchGridState} from '../scripts/lib/research-grid-state.mjs'
import { createResearchGrid } from '../packages/dsh-research-task-runtime/research-grid.js'

const item = (id,x,y,w=20,h=6) => ({id,x,y,w,h})

it.each(['standard','auto','three','two','one'])('%s 整理后组件异步测高或收起时仍铺满且不重叠',mode=>{
 const grid=createResearchGrid(),width=1240,state=createWorkbenchGridState(null,'closed-'+mode)
 const nodes=[['region',780],['overview',295],['schedule',490],['products',610]].map(([id,height])=>({
  id,kind:'generated-container',height,width:400,x:300,y:300,preferred:{height},
  containerSpec:{type:'html',html:id==='schedule'?'<body data-research-kind="gantt"></body>':'<body data-sherlock-market="table"></body>'}
 }))
 const cells=[item('region',0,0,20,30),item('overview',20,0,20,12),item('schedule',0,30,40,18),item('products',0,48,40,23)]
 state.enable(width)
 let snap=state.reconcile({files:[],artifacts:nodes,viewport:{y:0}})
 state.set(grid.arrange(nodes,cells,width,0,mode),{automatic:true})
 snap=state.reconcile(snap)
 const check=()=>{
  const shown=state.visible(),bottom=Math.max(...shown.map(c=>c.y+c.h))
  for(let y=0;y<bottom;y++){
   const row=shown.filter(c=>c.y<=y&&c.y+c.h>y).sort((a,b)=>a.x-b.x)
   let edge=0
   for(const card of row){expect(card.x).toBe(edge);edge+=card.w}
   expect(edge).toBe(grid.columns)
  }
 }
 check()
 const saved=state.get()
 for(const [id,height] of [['overview',170],['region',1000],['region',450],['products',270]]){
  const node=snap.artifacts.find(n=>n.id===id)
  expect(state.contentHeight(id,{html:node.containerSpec.html,width:node.width,height,layoutFit:true})).toBe(true)
  snap=state.reconcile(snap)
  expect(snap.artifacts.find(n=>n.id===id).height).toBeGreaterThanOrEqual(height)
  check()
 }
 expect(state.get()).toEqual(saved)
})

it('fits later cards below short neighbours without waiting for the tallest chart',()=>{
 const grid=createResearchGrid(),m=grid.metrics(1200)
 const nodes=[240,720,330,250,270].map((height,i)=>({id:'card'+i,preferred:{height}}))
 const cells=nodes.map((node,i)=>item(node.id,0,i*20))
 const arranged=grid.arrange(nodes,cells,1200,0,'auto'),[short,tall,medium,firstFill,secondFill]=arranged
 expect(short.y).toBe(0);expect(tall.y).toBe(0);expect(medium.y).toBe(0)
 expect(firstFill.y).toBe(short.y+short.h)
 expect(secondFill.y).toBe(medium.y+medium.h)
 expect(arranged.every((cell,i)=>arranged.every((peer,j)=>i===j||!grid.overlap(cell,peer)))).toBe(true)
 expect(short.h*m.step-m.gap).toBeLessThan(240+m.step)
 expect(grid.arrange(nodes,arranged,1200,0,'auto')).toEqual(arranged)
})
it('closes holes before a full-width card even after a table refits',()=>{
 const grid=createResearchGrid(),width=1200,state=createWorkbenchGridState(null,'full-width-boundary')
 const html='<body data-sherlock-market="table"></body>'
 const nodes=[['short',230],['middle',330],['tall',440],['gantt',340]].map(([id,height])=>({
  id,kind:'generated-container',height,width:400,x:400,y:300,preferred:{height},
  containerSpec:{type:'html',html:id==='gantt'?'<body data-research-kind="gantt"></body>':html}
 }))
 state.enable(width)
 let snap=state.reconcile({files:[],artifacts:nodes,viewport:{y:0}})
 state.set(grid.arrange(nodes,nodes.map((node,i)=>item(node.id,0,30*i)),width,0,'auto'),{automatic:true})
 snap=state.reconcile(snap)
 expect(state.contentHeight('short',{html,width:snap.artifacts[0].width,height:170,layoutFit:true})).toBe(true)
 state.reconcile(snap)
 const [short,middle,tall,gantt]=state.visible()
 expect([short,middle,tall].map(c=>c.y+c.h)).toEqual([gantt.y,gantt.y,gantt.y])
 expect(gantt.w).toBe(40)
 expect(state.get()[0].h).toBeLessThan(short.h)
 expect(state.visible().some(a=>state.visible().some(b=>grid.overlap(a,b)))).toBe(false)
})
it('真实表格分页测量可增高与缩短，末页收紧且不覆盖用户手动高度或共享文档',()=>{
 const state=createWorkbenchGridState(null,'page-fit'),grid=createResearchGrid(),html='<body data-sherlock-market="table"></body>'
 state.enable(900)
 let snap=state.reconcile({files:[],artifacts:[{id:'table',kind:'generated-container',width:876,height:850,containerSpec:{type:'html',html}},{id:'next',kind:'pasted-text',width:876,height:240}],viewport:{y:0}})
 let canonical=state.document(snap);const width=snap.artifacts[0].width
 const fit=height=>{expect(state.contentHeight('table',{html,width,height,layoutFit:true})).toBe(true);snap=state.reconcile(snap);expect(snap.artifacts[0].height).toBeGreaterThanOrEqual(height);expect(snap.artifacts[0].height).toBeLessThan(height+grid.metrics(900).rowStep+1);expect(grid.overlap(...state.visible())).toBe(false);expect(state.document(snap)).toEqual(canonical)}
 // Automatic layout changes must not be mistaken for a deliberate user resize.
 state.set(state.get().map(c=>c.id==='table'?{...c,h:40}:c),{automatic:true});snap=state.reconcile(snap);canonical=state.document(snap)
 for(const height of [720,420,1620,300])fit(height)
 state.set(state.get().map(c=>c.id==='table'?{...c,h:30}:c));snap=state.reconcile(snap)
 const manual=snap.artifacts[0].height
 state.contentHeight('table',{html,width,height:400,layoutFit:true});snap=state.reconcile(snap)
 expect(snap.artifacts[0].height).toBe(manual)
})
it.each(['html','market'])('原生 %s 表格实际测量协议随分页增高缩短并拒绝过期内容',type=>{
 const ui=readFileSync(new URL('../scripts/lib/research-grid-ui.mjs',import.meta.url),'utf8')
 const fit=vm.runInNewContext('('+ui.slice(ui.indexOf('export function workbenchNativeTableFit('),ui.indexOf('export function workbenchNativeTableDimensions(')).replace(/^export /u,'')+')',{workbenchNativeTableDimensions:table=>({height:table.height})})
 const state=createWorkbenchGridState(null,'native-page-'+type);state.enable(900)
 const spec=type==='html'?{type,html:'<body data-sherlock-market="table"></body>'}:{type,variant:'table',rows:[['完整数据']]}
 let snap=state.reconcile({files:[],artifacts:[{id:'table',kind:'generated-container',width:876,height:400,containerSpec:spec},{id:'next',kind:'pasted-text',width:876,height:240}],viewport:{y:0}})
 const grid=createResearchGrid()
 state.set(state.get().map(c=>c.id==='table'?{...c,h:40}:c),{automatic:true});snap=state.reconcile(snap)
 const canonical=state.document(snap)
 for(const height of [720,1520,300,1620]){
  const message=fit(snap.artifacts[0],{height})
  expect(state.contentHeight('table',message)).toBe(true);snap=state.reconcile(snap)
  expect(snap.artifacts[0].height).toBeGreaterThanOrEqual(height)
  expect(snap.artifacts[0].height).toBeLessThan(height+grid.metrics(900).rowStep+1)
  expect(grid.overlap(...state.visible())).toBe(false);expect(state.document(snap)).toEqual(canonical)
 }
 const stale=fit({...snap.artifacts[0],containerSpec:type==='html'?{...spec,html:'stale'}:{...spec,rows:[['stale']]}},{height:2000})
 expect(state.contentHeight('table',stale)).toBe(false)
 state.set(state.get().map(cell=>cell.id==='table'?{...cell,h:20}:cell));snap=state.reconcile(snap)
 const manual=snap.artifacts[0].height;state.contentHeight('table',fit(snap.artifacts[0],{height:300}));snap=state.reconcile(snap)
 expect(snap.artifacts[0].height).toBe(manual)
})
it('图表默认展开明细后按内容自动补高并让后续卡片避让，保留共享布局与手动尺寸',()=>{
 const state=createWorkbenchGridState(null,'expanded-chart'),g=createResearchGrid(),html='<body data-research-kind="chart" data-chart-template="horizontal"></body>';
 state.enable(600);
 let snap=state.reconcile({files:[],artifacts:[{id:'chart',kind:'generated-container',width:576,height:320,containerSpec:{type:'html',html}},{id:'next',kind:'pasted-text',width:576,height:240}],viewport:{y:0}});
 const canonical=state.document(snap),width=snap.artifacts[0].width;
 expect(state.contentHeight('chart',{html,width,height:640})).toBe(true);snap=state.reconcile(snap);
 expect(snap.artifacts[0].height).toBeGreaterThanOrEqual(640);
 expect(g.overlap(...state.visible())).toBe(false);expect(state.document(snap)).toEqual(canonical);
 expect(state.contentHeight('chart',{html,width,height:640})).toBe(false);
 expect(state.contentHeight('chart',{html:'stale',width,height:900})).toBe(false);
 const resized=state.get().map(c=>c.id==='chart'?{...c,h:30}:c);state.set(resized);snap=state.reconcile(snap);
 expect(state.contentHeight('chart',{html,width,height:900})).toBe(false);
 expect(state.document(snap)).not.toEqual(canonical);
});
it('新规划的宽排程跨整行，支持卡片分列且手动缩放仍可用',()=>{
 const g=createResearchGrid(),state=createWorkbenchGridState(null,'semantic-wide');state.enable(1104);
 let snap=state.reconcile({files:[],artifacts:[],viewport:{y:0}});
 const nodes=['schedule','tasks','alerts'].map((id,i)=>({id,kind:'generated-container',workbenchId:'semantic',workbenchIndex:i,sizeMode:'auto',x:330,y:170,width:656,height:340,...(i===0?{workbenchSpan:true,workbenchLayoutVersion:1}:{})}));
 snap=state.reconcile({...snap,artifacts:nodes});const cells=state.get();
 expect(cells[0]).toMatchObject({x:0,y:0,w:40});expect(cells[1].y).toBeGreaterThanOrEqual(cells[0].h);expect(cells[2].y).toBe(cells[1].y);expect(cells[1].w).toBe(20);
 expect(cells.every((a,i)=>cells.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true);
 expect(g.minimum(nodes[0],g.metrics(1104)).w).toBeLessThan(40);
 expect(g.minimum(nodes[0],g.metrics(1104),true).w).toBe(40);
});
it('撤下工作台规划占位后，生成中的整组组件立即上移填补顶部空白',()=>{
 const state=createWorkbenchGridState(null,'planning-gap'),g=createResearchGrid();state.enable(1104)
 let snap=state.reconcile({files:[],artifacts:[],viewport:{x:0,y:0,scale:1}})
 state.reservePlanning({id:'intent',startedAt:1000},snap,{x:380,y:320})
 const panels=Array.from({length:8},(_,i)=>({id:'panel-'+i,kind:'generated-container',workbenchId:'batch',workbenchIndex:i,x:330,y:170,width:656,height:320,sizeMode:'auto',generationStatus:i<2?'completed':'queued',...(i<2?{containerSpec:{type:'table'}}:{})}))
 snap=state.reconcile({...snap,artifacts:panels})
 snap=state.reconcile(snap) // React/layout publishes again before the planning card unmounts.
 expect(Math.min(...state.get().filter(c=>c.id!=='intent').map(c=>c.y))).toBeGreaterThan(0)
 state.releasePlanning('intent');snap=state.reconcile(snap)
 expect(state.get().find(c=>c.id==='panel-0')).toMatchObject({x:0,y:0,w:20})
 expect(state.get().find(c=>c.id==='panel-1')).toMatchObject({x:20,y:0,w:20})
 expect(state.get().find(c=>c.id==='panel-2')).toMatchObject({x:0,y:13,w:20})
 expect(state.get().find(c=>c.id==='panel-3')).toMatchObject({x:20,y:13,w:20})
 expect(state.get().every((a,i,all)=>all.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(Math.min(...snap.artifacts.map(n=>n.y-n.height/2))).toBe(12)
})
it('重开仍在生成的旧工作台时修复规划占位遗留的空白，同时保留手动单卡位置',()=>{
 const saved={version:2,cells:[item('a',0,21,20,23),{...item('b',20,21,20,17),freePosition:true}]}
 const state=createWorkbenchGridState({getItem:()=>JSON.stringify(saved)},'saved-planning-gap');state.enable(1104)
 state.reconcile({files:[],artifacts:[{id:'a',kind:'generated-container',workbenchId:'batch',workbenchIndex:0,sizeMode:'manual',generationStatus:'completed',containerSpec:{type:'table'}},{id:'b',kind:'generated-container',workbenchId:'batch',workbenchIndex:1,sizeMode:'manual',generationStatus:'running'}],viewport:{y:0}})
 expect(state.get().map(c=>c.y)).toEqual([0,0])
 const manual=createWorkbenchGridState({getItem:()=>JSON.stringify({version:2,cells:[{...item('manual',0,21,20,17),freePosition:true}]})},'manual-gap');manual.enable(1104)
 manual.reconcile({files:[],artifacts:[{id:'manual',kind:'generated-container',preserveGenerationSize:true,creationMode:'selection',generationStatus:'running'}],viewport:{y:0}})
 expect(manual.get()[0].y).toBe(21)
})
it('窗口小幅变窄先扩到统一最小宽度并借用右列余宽，保持并排与纵向列对齐且恢复宽度不改文档',()=>{
 const state=createWorkbenchGridState(null,'responsive-neighbours'),g=createResearchGrid();state.enable(1000)
 let snap=state.reconcile({files:[],artifacts:['index','watch','quote','news','announcements'].map(id=>({id,kind:'generated-container',containerSpec:{type:'financial-widget'},width:400,height:300})),viewport:{y:0}})
 state.set([item('index',0,0,40,8),item('watch',0,8,12,12),item('quote',12,8,28,25),item('news',0,20,12,18),item('announcements',12,33,28,16)]);snap=state.reconcile(snap)
 const canonical=state.document(snap),at=id=>state.visible().find(c=>c.id===id)
 for(const width of [950,880,700]){state.enable(width);snap=state.reconcile(snap);expect(at('watch').y).toBe(at('quote').y);expect(at('quote').x).toBe(at('watch').w);expect(at('news').w).toBe(at('watch').w);expect(at('announcements').x).toBe(at('quote').x);expect(snap.artifacts.every(n=>n.width>=280)).toBe(true);expect(state.visible().every((a,i,all)=>all.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true);expect(state.document(snap)).toEqual(canonical)}
 state.enable(540);snap=state.reconcile(snap);expect(at('quote').y).toBeGreaterThan(at('watch').y);for(const id of ['watch','quote','news','announcements'])expect(at(id)).toMatchObject({x:0,w:40});expect(state.document(snap)).toEqual(canonical)
 state.enable(1000);snap=state.reconcile(snap);expect(state.visible()).toEqual(state.get());expect(state.document(snap)).toEqual(canonical)
})
it('不同排使用不同列宽时各自借宽，不被上方无需调整的两等列提前终止',()=>{
 const state=createWorkbenchGridState(null,'multiple-responsive-lanes');state.enable(1000)
 let snap=state.reconcile({files:[],artifacts:['a','b','watch','quote','c','d'].map(id=>({id,kind:'generated-container',containerSpec:{type:'financial-widget'},width:400,height:300})),viewport:{y:0}})
 state.set([item('a',0,0,20,12),item('b',20,0,20,12),item('watch',0,12,12,12),item('quote',12,12,28,12),item('c',0,24,16,12),item('d',16,24,24,12)]);snap=state.reconcile(snap)
 const canonical=state.document(snap)
 for(const width of [880,700]){state.enable(width);snap=state.reconcile(snap);const at=id=>state.visible().find(c=>c.id===id);for(const [a,b] of [['a','b'],['watch','quote'],['c','d']]){expect(at(a).y).toBe(at(b).y);expect(at(b).x).toBe(at(a).w)}expect(state.document(snap)).toEqual(canonical)}
})
it('明确三排整理在窄视口及重开后不被阅读宽度下限改回两列，标准整理恢复默认下限',()=>{
 const g=createResearchGrid(),saved=new Map(),storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}
 let state=createWorkbenchGridState(storage,'exact-three');state.enable(640)
 let snap=state.reconcile({files:[],artifacts:['a','b','c','d'].map(id=>({id,kind:'pasted-text',width:400,height:260})),viewport:{y:0}})
 const nodes=snap.artifacts.map(n=>({...n,preferred:{height:260}})),next=g.arrange(nodes,state.get(),640,700,'three')
 state.set(next);snap=state.reconcile(snap)
 expect(state.visible().filter(c=>c.y===0).map(c=>c.x)).toEqual([0,13,27])
 expect(snap.artifacts.slice(0,3).every(n=>n.width<280)).toBe(true)
 state.save();state=createWorkbenchGridState(storage,'exact-three');state.enable(640);snap=state.reconcile(snap)
 expect(state.visible().filter(c=>c.y===0).map(c=>c.x)).toEqual([0,13,27])
 state.enable(880);snap=state.reconcile(snap)
 expect(state.visible().filter(c=>c.y===0).map(c=>c.x)).toEqual([0,13,27])
 state.set(g.arrange(snap.artifacts.map(n=>({...n,preferred:{height:260}})),state.get(),640,700,'standard'));snap=state.reconcile(snap)
 expect(snap.artifacts.every(n=>n.width>=280)).toBe(true)
})
it.each(['share-statistics','metrics'])('快照 %s 随画布变窄保留完整内容占位，不改共享逻辑布局，手动缩高仍有效',kind=>{
 const state=createWorkbenchGridState(null,'responsive-snapshots'),g=createResearchGrid(),html=`<body data-sherlock-market="${kind}"></body>`
 state.enable(1000)
 let snap=state.reconcile({files:[],artifacts:[{id:'a',kind:'generated-container',width:980,height:330,containerSpec:{type:'html',html}},{id:'b',kind:'pasted-text',width:480,height:200}],viewport:{y:0}})
 state.set([item('a',0,0,40,15),item('b',0,15,40,12)]);snap=state.reconcile(snap)
 const canonical=state.document(snap)
 state.enable(600);snap=state.reconcile(snap)
 expect(state.contentHeight('a',{html,width:576,height:290})).toBe(true);snap=state.reconcile(snap)
 expect(snap.artifacts[0].height).toBeGreaterThanOrEqual(290)
 expect(g.overlap(...state.visible())).toBe(false)
 expect(state.document(snap)).toEqual(canonical)
 const small=state.get().map(c=>c.id==='a'?{...c,h:12}:c);state.set(small);snap=state.reconcile(snap)
 expect(snap.artifacts[0].height).toBeLessThan(290)
 expect(state.contentHeight('a',{html,width:576,height:300})).toBe(false)
 state.enable(500);snap=state.reconcile(snap)
 expect(state.contentHeight('a',{html,width:476,height:310})).toBe(true);snap=state.reconcile(snap)
 expect(snap.artifacts[0].height).toBeGreaterThanOrEqual(310)
 expect(state.contentHeight('b',{html,width:484,height:1000})).toBe(false)
 expect(state.contentHeight('a',{html:'stale',width:484,height:1000})).toBe(false)
})
it('金融快照标准整理保留已有同行，通用最低宽不足才拆行，重复稳定',()=>{
 const g=createResearchGrid(),variants=['share-statistics','market-overview','currency-snapshot','watchlist']
 for(const width of [900,1000,1400,320]){
  const nodes=variants.map((variant,i)=>({id:variant,kind:'generated-container',containerSpec:{type:'html',html:`<style>body[data-sherlock-market="watchlist"]{}</style><body data-sherlock-market="${variant}"></body>`},preferred:{height:330+i*25}}))
  const before=nodes.map((n,i)=>item(n.id,i%2*20,Math.floor(i/2)*20,20,20)),next=g.arrange(nodes,before,width),shown=g.project(nodes,next,width)
  expect(shown.every(n=>n.width>=Math.min(280,width-24)-.001)).toBe(true)
  if(width>=900)expect(next.map(c=>c.w)).toEqual([20,20,20,20]);else expect(next.every(c=>c.w===40)).toBe(true)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
 const m=g.metrics(1000),ordinary={kind:'generated-container',containerSpec:{type:'html',html:'<style>body[data-sherlock-market="watchlist"]{}</style><body data-sherlock-market="metrics"></body>'}}
 expect(g.minimum(ordinary,m).w).toBe(m.minColumns)
})
it('预置宽快照首次挂载使用整行，手动宽度仍可收窄到契约最小值',()=>{
 const g=createResearchGrid(),state=createWorkbenchGridState(null,'wide-snapshots');state.enable(900)
 const base={files:[],artifacts:[],viewport:{y:0}};state.reconcile(base)
 const nodes=['currency-snapshot','watchlist'].map((kind,i)=>({id:kind,kind:'generated-container',workbenchId:'snapshot',workbenchIndex:i,width:980,height:430,sizeMode:'auto',containerSpec:{type:'html',html:`<body data-sherlock-market="${kind}"></body>`}}))
 state.reconcile({...base,artifacts:nodes})
 expect(state.get().every(c=>c.x===0&&c.w===40)).toBe(true)
 const min=g.minimum(nodes[0],g.metrics(900));expect(min.w*g.metrics(900).step-10).toBeGreaterThanOrEqual(280);expect(min.w).toBeLessThan(40)
})
it('标准整理旧运营看板保持原行，独行长尾铺满且柱状图保留自然高度',()=>{
 for(const width of [810,1000]){
  const g=createResearchGrid(),m=g.metrics(width),before=[item('metrics',0,0,15,20),item('calendar',15,0,25,15),item('gantt',0,20,15,14),item('news',0,34,15,15),item('reports',0,49,15,29),item('bar',0,78,15,17)]
  const nodes=before.map(c=>({id:c.id,kind:'generated-container',containerSpec:{},preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,width)
  expect(next.find(c=>c.id==='metrics')).toMatchObject({x:0,y:0,w:15,h:20})
  expect(next.find(c=>c.id==='calendar')).toMatchObject({x:15,y:0,w:25,h:20})
  expect(next.filter(c=>!['metrics','calendar'].includes(c.id)).every(c=>c.x===0&&c.w===40)).toBe(true)
  expect(next.find(c=>c.id==='bar').h).toBe(17)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
})
it('空画板首次挂载工作台占满两列，排队到完成保持默认格位，后续批次不改已有布局',()=>{
 const state=createWorkbenchGridState(null,'new-workbench'),g=createResearchGrid()
 state.enable(900)
 let snap=state.reconcile({files:[],artifacts:[],viewport:{x:0,y:0,scale:1}})
 const panels=Array.from({length:6},(_,i)=>({id:'panel-'+i,kind:'generated-container',workbenchId:'batch',workbenchIndex:i,x:330,y:170,width:656,height:i===1?352:270,sizeMode:'auto',generationStatus:'queued'}))
 snap=state.reconcile({...snap,artifacts:panels})
 const geometry=()=>state.get().map(({freePosition,...c})=>c),before=geometry(),at=id=>before.find(c=>c.id===id)
 expect(at('panel-0')).toMatchObject({x:0,y:0,w:20});expect(at('panel-1')).toMatchObject({x:20,y:0,w:20})
 expect(before.every((a,i)=>before.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(snap.artifacts.every(n=>n.height>=320)).toBe(true)
 snap=state.reconcile({...snap,artifacts:snap.artifacts.map(n=>({...n,generationStatus:'completed',containerSpec:{type:'table'}}))})
 expect(geometry()).toEqual(before)
 state.reconcile({...snap,artifacts:[...snap.artifacts,...panels.slice(0,2).map((n,i)=>({...n,id:'later-'+i,workbenchId:'later'}))]})
 expect(geometry().slice(0,6)).toEqual(before)
 expect(state.get().slice(6).every(c=>c.y>=Math.max(...before.map(c=>c.y+c.h)))).toBe(true)
})
it('窄画板新工作台默认占满一列，手动拉框及普通单卡保留追加规则',()=>{
 const state=createWorkbenchGridState(null,'narrow');state.enable(500)
 const base={files:[],artifacts:[],viewport:{y:0}};state.reconcile(base)
 const nodes=Array.from({length:2},(_,i)=>({id:'n'+i,workbenchId:'b',workbenchIndex:i,kind:'generated-container',width:656,height:300,sizeMode:'auto',generationStatus:'queued'}))
 const snap=state.reconcile({...base,artifacts:nodes})
 expect(state.get().every(c=>c.x===0&&c.w===40)).toBe(true)
 const before=state.get().map(c=>({...c}))
 state.reconcile({...snap,artifacts:[...snap.artifacts,{id:'manual',workbenchId:'manual',kind:'generated-container',width:320,height:220,sizeMode:'manual',preserveGenerationSize:true}]})
 expect(state.get().slice(0,2)).toEqual(before);expect(state.get().at(-1).w).toBeLessThan(40)
})
it('标准整理填满局部行宽，不把原本不同行的错位卡片重新并列',()=>{
 for(const width of [1000,1230,1400]){
  const g=createResearchGrid(),m=g.metrics(width),before=[item('gold',0,0,20,8),item('pharma',20,0,20,9),item('table',0,8,20,10),item('btc',22,9,18,10),item('stocks',0,18,20,12),item('news',22,19,18,22),item('report',0,30,20,36)]
  const nodes=before.map(c=>({id:c.id,kind:'generated-container',containerSpec:{},preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,width)
  expect(next.find(c=>c.id==='gold')).toMatchObject({x:0,w:20})
  expect(next.find(c=>c.id==='pharma')).toMatchObject({x:20,w:20})
  for(const id of ['table','btc','stocks','news','report'])expect(next.find(c=>c.id===id)).toMatchObject({x:0,w:40})
  expect(next.find(c=>c.id==='gold').h).toBe(next.find(c=>c.id==='pharma').h)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
})
it('标准整理后续独行组件铺满，不把原行长尾移入上方短列',()=>{
 for(const width of [1000,1230,1400]){
  const g=createResearchGrid(),m=g.metrics(width),before=[item('gold',0,0,22,8),item('pharma',22,0,18,8),item('table',0,8,22,10),item('btc',22,8,18,7),item('stocks',22,15,18,11),item('news',22,26,18,22),item('report',22,48,18,40),item('candle',22,88,18,16),item('heatmap',22,104,18,12)]
  const nodes=before.map(c=>({id:c.id,kind:'generated-container',containerSpec:{},preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,width),at=id=>next.find(c=>c.id===id)
  expect(at('gold')).toMatchObject({x:0,y:0,w:22,h:8});expect(at('pharma')).toMatchObject({x:22,y:0,w:18,h:8})
  expect(at('table')).toMatchObject({x:0,y:8,w:22,h:10})
  expect(at('btc')).toMatchObject({x:22,y:8,w:18,h:10})
  expect(next.filter(c=>['stocks','news','report','candle','heatmap'].includes(c.id)).every(c=>c.x===0&&c.w===40)).toBe(true)
  expect(at('report').y).toBe(at('news').y+at('news').h)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
})
it('手动调整所有组件统一最小280×160，窄画板仅限制可用宽度',()=>{
 const g=createResearchGrid()
 for(const width of [1000,700,500,240]){
  const m=g.metrics(width)
  for(const node of [{kind:'pasted-text'},{kind:'link'},{kind:'planning-card'},{kind:'generated-container'},{kind:'generated-container',containerSpec:{}},...['price-performance','financial-statements','dividends'].flatMap(kind=>['短标题','很长的来源说明、证券名称与单位 '.repeat(20)].map(title=>({kind:'generated-container',title,containerSpec:{type:'html',html:'<body data-sherlock-market="'+kind+'"></body>'}})))]){
   const min=g.minimum(node,m)
   expect(min).toEqual({w:m.minColumns,h:m.minRows})
   expect(min.w*m.step-m.gap).toBeGreaterThanOrEqual(Math.min(280,width-24))
   expect(min.h*m.step-m.gap).toBeGreaterThanOrEqual(160)
  }
 }
})
it('创建、投影和吸附共同使用实时正方形格位',()=>{
 const grid=createResearchGrid()
 for(const width of [824,1000,1376]){
  const m=grid.metrics(width)
  expect(m.rowStep).toBe(m.step)
  const c=grid.draw({x:12+m.step*3,y:12+m.step*4},{x:12+m.step*15-10,y:12+m.step*13-10},m)
  expect(c).toMatchObject({x:3,y:4,w:Math.max(12,m.minDraftColumns),h:Math.max(9,m.minDraftRows)})
  const n=grid.project([{id:c.id}],[c],width)[0]
  expect(n.x-n.width/2).toBeCloseTo(12+c.x*m.step)
  expect(n.y-n.height/2).toBeCloseTo(12+c.y*m.step)
  expect(n.width+10).toBeCloseTo(c.w*m.step)
  expect(n.height+10).toBeCloseTo(c.h*m.step)
 }
})
describe('研究工作台网格事务',()=>{
 it('插入拉框占位时向下让位并保持原有宽度',()=>{
  const grid=createResearchGrid(), before=[item('a',0,0),item('b',20,0),item('c',0,6)]
  const next=grid.place(before,item('new',0,0,20,8),'new')
  expect(next.find(n=>n.id==='new')).toMatchObject({x:0,y:0,w:20,h:8})
  expect(next.find(n=>n.id==='a').y).toBe(8)
  expect(next.find(n=>n.id==='c').y).toBe(14)
  expect(next.find(n=>n.id==='b').y).toBe(0)
  expect(before[0].y).toBe(0)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!grid.overlap(a,b)))).toBe(true)
 })
 it('向上拖动交换占位，松手补上原空位',()=>{
  const grid=createResearchGrid(), before=[item('a',0,0),item('b',0,6),item('c',20,0)]
  const next=grid.place(before,item('b',0,0),'b')
  expect(next.find(n=>n.id==='b').y).toBe(0)
  expect(next.find(n=>n.id==='a').y).toBe(6)
  expect(next.find(n=>n.id==='c').y).toBe(0)
 })
 it('删除和缩小组件后纵向补位，不横向挤成等大卡片',()=>{
  const grid=createResearchGrid()
  expect(grid.compact([item('a',0,0,13,4),item('b',13,8,27,9)])[1]).toMatchObject({x:13,y:0,w:27,h:9})
  expect(grid.compact([item('a',0,0,20,4),item('b',0,9)])[1].y).toBe(4)
 })
 it('前后反向拉框使用相同最近格位，且不超过40列',()=>{
  const grid=createResearchGrid(), metrics=grid.metrics(1224)
  const a=grid.draw({x:1220,y:320},{x:620,y:40},metrics)
  const b=grid.draw({x:620,y:40},{x:1220,y:320},metrics)
  expect(a).toEqual(b);expect(a.x+a.w).toBeLessThanOrEqual(40)
  expect(a.w).toBeGreaterThanOrEqual(4);expect(a.h).toBeGreaterThanOrEqual(3)
 })
 it('链接和语音优先补齐能容纳完整高度的行',()=>{
  const grid=createResearchGrid(), before=[item('a',0,0,20,6),item('b',0,6,40,8)]
  expect(grid.append(before,'link')).toMatchObject({x:0,y:14,w:20,h:7})
  expect(grid.append([...before,grid.append(before,'link')],'voice')).toMatchObject({x:20,y:14})
 })
 it('迁移保留内容标识、阅读顺序、不等大尺寸，宽度变化仅重排几何',()=>{
  const grid=createResearchGrid(), nodes=[{id:'a',x:300,y:200,width:560,height:320,title:'真实数据'}, {id:'b',x:920,y:200,width:560,height:520}]
  const cells=grid.migrate(nodes,1224), large=grid.project(nodes,cells,1224), narrow=grid.project(nodes,cells,824)
  expect(large.map(n=>n.id)).toEqual(['a','b']);expect(large[0].title).toBe('真实数据')
  expect(cells.find(n=>n.id==='b').h).toBeGreaterThan(cells.find(n=>n.id==='a').h)
  expect(narrow[0].width).toBeLessThan(large[0].width)
  expect((narrow[0].height+10)/(large[0].height+10)).toBeCloseTo(grid.metrics(824).step/grid.metrics(1224).step)
  expect(narrow[0].sizeMode).toBe('manual')
 })
})

it('标准整理填满行宽，同行按最大内容高度拉齐，不等宽比例保持稳定',()=>{
 const g=createResearchGrid(),nodes=[{id:'a',preferred:{width:640,height:290}},{id:'b',preferred:{width:340,height:200}},{id:'c',preferred:{width:600,height:460}}],before=[item('a',0,0,26,6),item('b',26,0,14,5),item('c',0,45,26,13)]
 const next=g.arrange(nodes,before,1000,700),bottom=Math.max(...next.map(c=>c.y+c.h))
 expect(next.map(c=>c.id)).toEqual(['a','b','c']);expect(new Set(next.map(c=>c.w)).size).toBeGreaterThan(1)
 expect(Math.max(...next.map(c=>c.x+c.w))).toBe(40)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 const projected=g.project(nodes,next,1000);expect(projected[0].height).toBe(projected[1].height);expect(projected[0].height).toBeGreaterThanOrEqual(290);expect(projected[2].height).toBeGreaterThanOrEqual(460)
 expect(next.find(c=>c.id==='c')).toMatchObject({x:0,w:40,y:next[0].h})
 expect(g.arrange(nodes,next,1000,700)).toEqual(next)
 expect(Math.min(...next.map(c=>c.w*g.metrics(1000).step-10))).toBeGreaterThanOrEqual(280)
})

it('整理智能草稿仍满足输入区最小尺寸，三个草稿不会挤入不足宽的一行',()=>{
 const g=createResearchGrid(),nodes=['a','b','c'].map(id=>({id,kind:'generated-container',width:320,height:220})),before=nodes.map((n,i)=>item(n.id,i*12,0,12,3))
 const next=g.arrange(nodes,before,1000),shown=g.project(nodes,next,1000)
 expect(shown.every(n=>n.width>=320&&n.height>=220)).toBe(true)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(new Set(next.map(n=>n.y)).size).toBeGreaterThan(1)
})

it('标准整理短图表拉齐同排长文章，完整内容决定行高',()=>{
 const g=createResearchGrid(),nodes=[{id:'chart',preferred:{width:480,height:280}},{id:'article',preferred:{width:480,height:3400}}],before=[item('chart',0,0,20,25),item('article',20,0,20,25)]
 const shown=g.project(nodes,g.arrange(nodes,before,1000,1600),1000)
 expect(shown.find(n=>n.id==='chart').height).toBeGreaterThanOrEqual(280)
 expect(shown.find(n=>n.id==='chart').height).toBe(shown.find(n=>n.id==='article').height)
 expect(shown.find(n=>n.id==='article').height).toBeGreaterThanOrEqual(3400)
})

it('标准整理同行不等高卡片拉齐底边，后续同行仍在下一行',()=>{
 const g=createResearchGrid(),nodes=[{id:'a',preferred:{width:480,height:280}},{id:'b',preferred:{width:480,height:460}},{id:'c',preferred:{width:480,height:220}},{id:'d',preferred:{width:480,height:330}}],before=nodes.map((n,i)=>item(n.id,i%2*20,Math.floor(i/2)*24,20,24))
 const next=g.arrange(nodes,before,1000,1400),shown=g.project(nodes,next,1000)
 expect(shown.find(n=>n.id==='a').height).toBe(shown.find(n=>n.id==='b').height)
 expect(shown.find(n=>n.id==='b').height).toBeGreaterThanOrEqual(460)
 expect(next.find(n=>n.id==='c').y).toBe(next.find(n=>n.id==='a').h)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.arrange(nodes,next,1000,1400)).toEqual(next)
})

it('移动按邻居中线插入，覆盖下半部时落到其后，空槽在预览阶段补位',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,20,6),item('b',0,6,20,9),item('c',20,0,20,5)]
 expect(g.move(before,item('a',0,3,20,6)).find(c=>c.id==='a').y).toBe(0)
 const next=g.move(before,item('a',0,12,20,6))
 expect(next.find(c=>c.id==='b').y).toBe(0)
 expect(next.find(c=>c.id==='a').y).toBe(9)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.move(before,item('a',0,0,20,6))).toEqual(before)
 expect(g.move([item('a',0,0)],item('a',0,14)).find(c=>c.id==='a').y).toBe(0)
})

it('长组件跨列按鼠标抓取点让位，组件中心不把落点推到下方',()=>{
 const g=createResearchGrid(),before=[item('article',0,0,20,40),item('b',20,0,20,10),item('c',20,10,20,10)],target=item('article',20,1,20,40)
 const next=g.move(before,target,before,target,.5)
 expect(next.find(c=>c.id==='article')).toMatchObject({x:20,y:0,h:40})
 expect(next.find(c=>c.id==='b').y).toBe(40);expect(next.find(c=>c.id==='c').y).toBe(50)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
})

it('不同宽高邻居的插入决策在四分之一行切换，不用半格近似',()=>{
 const g=createResearchGrid(),before=[item('article',0,20,26,40),item('b',14,0,14,9),item('c',28,0,12,16)],target=item('article',14,6,26,40)
 expect(g.moveSlot(before,target,6.1)).toEqual({id:'b',after:true})
 expect(g.moveSlot(before,target,6.4)).toEqual({id:'c',after:false})
 expect(g.move(before,target,before,target,6.1).find(c=>c.id==='article').y).toBe(9)
 expect(g.move(before,target,before,target,6.4).find(c=>c.id==='article').y).toBe(0)
})

it('ETF标准整理拉齐同排短表，后续通栏图保留整行且重复稳定',()=>{
 for(const width of [1000,1400]){
  const g=createResearchGrid(),m=g.metrics(width),before=[item('donut',0,0,20,20),item('table',20,0,20,11),item('volume',0,20,40,17),item('candle',0,37,40,17)]
  const nodes=before.map(c=>({id:c.id,kind:'generated-container',containerSpec:{},preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,width),at=id=>next.find(c=>c.id===id)
  expect(at('donut')).toMatchObject({x:0,y:0,h:20});expect(at('table')).toMatchObject({x:20,y:0,h:20})
  expect(at('volume')).toMatchObject({x:0,y:20,w:40,h:17})
  expect(at('candle')).toMatchObject({x:0,y:37,w:40,h:17})
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
})

it('整理时宽表格缩至可用短列，不跳过短指标下方可容纳的空位',()=>{
 const g=createResearchGrid(),nodes=[
  {id:'metrics',preferred:{width:480,height:240}},
  {id:'chart',preferred:{width:480,height:460}},
  {id:'table',preferred:{width:600,height:260}},
  {id:'article',preferred:{width:480,height:660}}
 ],before=nodes.map((n,i)=>item(n.id,i%2*20,Math.floor(i/2)*24,20,24))
 const next=g.arrange(nodes,before,1148),a=next.find(c=>c.id==='metrics'),table=next.find(c=>c.id==='table')
 expect(table).toMatchObject({x:a.x,y:a.y+a.h,w:a.w})
 expect(table.w*g.metrics(1148).step-g.metrics(1148).gap).toBeGreaterThanOrEqual(280)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.arrange(nodes,next,1148)).toEqual(next)
})

it('ETF标准整理保留同行两列比例，后续独行量价卡铺满且重复稳定',()=>{
 for(const width of [1000,1334,1400]){
  const g=createResearchGrid(),m=g.metrics(width),before=[item('candle',0,0,40,14),item('donut',0,14,27,16),item('table',27,14,13,9),item('volume',0,30,27,18)]
  const nodes=before.map(c=>({id:c.id,kind:'generated-container',containerSpec:{},preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,width),at=id=>next.find(c=>c.id===id)
  expect(at('candle')).toMatchObject(before[0]);expect(at('donut')).toMatchObject(before[1]);expect(at('table')).toMatchObject({x:27,y:14,w:13,h:16})
  expect(at('volume')).toMatchObject({x:0,y:30,w:40,h:18})
  expect(at('volume').w*m.step-m.gap).toBeGreaterThanOrEqual(280)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
})

it('整理以当前左右列及列内顺序为准，忽略创建顺序并保留宽度比例',()=>{
 const g=createResearchGrid(),nodes=[
  {id:'right-bottom',preferred:{width:800,height:260}},
  {id:'left-bottom',preferred:{width:320,height:260}},
  {id:'right-top',preferred:{width:800,height:460}},
  {id:'left-top',preferred:{width:320,height:200}}
 ],before=[item('right-bottom',24,40,16,24),item('left-bottom',0,40,24,24),item('right-top',24,0,16,32),item('left-top',0,0,24,32)]
 const next=g.arrange(nodes,before,1000),left=next.find(c=>c.id==='left-top'),right=next.find(c=>c.id==='right-top')
 expect(left).toMatchObject({x:0,y:0,w:24})
 expect(right).toMatchObject({x:24,y:0,w:16})
 expect(next.find(c=>c.id==='left-bottom')).toMatchObject({x:0,y:left.h,w:24})
 expect(next.find(c=>c.id==='right-bottom')).toMatchObject({x:24,y:right.h,w:16})
 expect(left.h).toBe(right.h)
 expect(g.arrange(nodes,next,1000)).toEqual(next)
 expect(next.map(c=>c.id)).toEqual(before.map(c=>c.id))
})

it('标准整理以原行而非交叠列分组，内容测高后下行比例保持稳定',()=>{
 const g=createResearchGrid(),staggered=[item('left',0,0,20,10),item('right',20,20,20,10)],nodes=staggered.map(c=>({id:c.id,preferred:{height:220}}))
 const next=g.arrange(nodes,staggered,1400)
 expect(next).toEqual([expect.objectContaining({id:'left',x:0,y:0,w:40}),expect.objectContaining({id:'right',x:0,y:next[0].h,w:40})])
 const before=[item('span',0,0,26,25),item('right',26,0,14,26),item('left',0,25,13,17),item('middle',13,25,13,10)]
 const nested=before.map((c,i)=>({id:c.id,preferred:{height:[651,421,185,663][i]}})),arranged=g.arrange(nested,before,1400)
 expect(arranged.map(c=>[c.x,c.w])).toEqual([[0,26],[26,14],[0,20],[20,20]])
 expect(arranged.find(c=>c.id==='left').y).toBe(arranged.find(c=>c.id==='span').h)
 expect(arranged.find(c=>c.id==='middle').y).toBe(arranged.find(c=>c.id==='span').h)
 expect(g.arrange(nested,arranged,1400)).toEqual(arranged)
})

it('标准整理将原本独行的浮动表格铺满，不越过先前行补位',()=>{
 const g=createResearchGrid(),before=[item('gold-metrics',0,0,20,9),item('chart',20,0,20,17),item('gold-table',0,9,20,10),item('summary',20,17,20,15),item('pharma-metrics',0,19,20,9),item('heatmap',20,32,20,12),item('floating-table',8,44,20,12),item('news',20,56,20,10),item('article',0,56,20,34)]
 const nodes=[...before].reverse().map(c=>({id:c.id,preferred:{height:c.h*g.metrics(1000).step-10}})),next=g.arrange(nodes,before,1000)
 expect(next.find(c=>c.id==='floating-table')).toMatchObject({x:0,y:63,w:40,h:12})
 expect(next.find(c=>c.id==='article')).toMatchObject({x:0,y:75,w:20,h:34})
 expect(next.find(c=>c.id==='heatmap')).toMatchObject({x:0,y:51,w:40,h:12})
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.arrange(nodes,next,1000)).toEqual(next)
})

it('多选调高共用尺寸增量，底下未选卡片让位且最小尺寸统一限制',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,20,8),item('b',20,0,20,10),item('c',0,10,40,6)],nodes=before.map(c=>({id:c.id}))
 const next=g.resizeSelection(before,['a','b'],'y',3,nodes,1000)
 expect(next.find(c=>c.id==='a')).toMatchObject({h:11,y:0})
 expect(next.find(c=>c.id==='b')).toMatchObject({h:13,y:0})
 expect(next.find(c=>c.id==='c').y).toBe(13)
 const shrink=g.resizeSelection(before,['a','b'],'y',-99,nodes,1000)
 expect(shrink.find(c=>c.id==='a').h).toBe(g.metrics(1000).minRows)
 expect(shrink.find(c=>c.id==='b').h-shrink.find(c=>c.id==='a').h).toBe(2)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.resizeSelection(before,['a','b'],'y',0,nodes,1000)).toEqual(before)
})

it('整理本轮就消除吸附后留下的外侧空位，重复整理不继续扩宽',()=>{
 const g=createResearchGrid(),before=[item('a',0,110,28,25),item('b',2,23,33,13),item('c',2,95,23,15)],nodes=before.map(c=>({id:c.id,preferred:{height:260}}))
 const next=g.arrange(nodes,before,700)
 expect(next.every(c=>c.x===0&&c.w===40)).toBe(true)
 expect(g.arrange(nodes,next,700)).toEqual(next)
})

it('多选调宽同步增量，保留未选同排组件的最小宽度',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,14,8),item('b',14,0,26,10),item('c',0,10,14,8),item('d',14,10,26,10)],nodes=before.map(c=>({id:c.id}))
 const next=g.resizeSelection(before,['a','c'],'x',7,nodes,1000)
 expect(next.find(c=>c.id==='a')).toMatchObject({w:21,x:0})
 expect(next.find(c=>c.id==='c')).toMatchObject({w:21,x:0})
 expect(next.find(c=>c.id==='b')).toMatchObject({w:19,x:21})
 expect(next.find(c=>c.id==='d')).toMatchObject({w:19,x:21})
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 const limit=g.resizeSelection(before,['a','c'],'x',99,nodes,1000)
 expect(limit.filter(c=>['b','d'].includes(c.id)).every(c=>c.w*g.metrics(1000).step-10>=280)).toBe(true)
 expect(limit.find(c=>c.id==='a').w).toBe(limit.find(c=>c.id==='c').w)
})

it('并排组件调宽先压缩右侧到最小宽度，再让无法容纳的组件换行',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,20,8),item('b',20,0,20,10),item('c',0,10,40,6)],nodes=before.map(c=>({id:c.id,kind:'generated-container',containerSpec:{}}))
 const next=g.resize(before,{...before[0],w:26},nodes,1000)
 expect(next.find(c=>c.id==='a')).toMatchObject({x:0,y:0,w:26,h:8})
 expect(next.find(c=>c.id==='b')).toMatchObject({x:26,y:0,w:14,h:10})
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 const limit=g.resize(before,{...before[0],w:30},nodes,1000)
 expect(limit.find(c=>c.id==='b').y).toBeGreaterThanOrEqual(8)
 expect(limit.find(c=>c.id==='b').w).toBe(20)
 expect(g.resize(before,{...before[0]},nodes,1000)).toEqual(before)
})
it('三列调宽逐个压缩，智能草稿最小宽度保持且规范高度不变',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,12,6),item('b',12,0,14,7),item('c',26,0,14,8)]
 const next=g.resize(before,{...before[0],w:16},[{id:'b',kind:'generated-container'},{id:'c'}],1400),m=g.metrics(1400)
 expect(next.find(c=>c.id==='b').w*m.step-m.gap).toBeGreaterThanOrEqual(320)
 expect(next.map(c=>c.h)).toEqual([6,7,8]);expect(next.map(c=>c.y)).toEqual([0,0,0])
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
})

it('标准整理消除同行高度差，后续跨列组件保持下一行',()=>{
 const g=createResearchGrid(),m=g.metrics(800),before=[item('gold',0,0,20,12),item('chart',20,0,20,23),item('pharma',0,12,20,14),item('table',0,26,40,12)]
 const nodes=before.map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,800)
 const chart=next.find(c=>c.id==='chart'),pharma=next.find(c=>c.id==='pharma'),table=next.find(c=>c.id==='table')
 expect(chart.h).toBe(23);expect(pharma).toMatchObject({x:0,w:40,y:23,h:14})
 expect(table.y).toBe(pharma.y+pharma.h)
 expect(g.arrange(nodes,next,800)).toEqual(next)
 const huge=[item('chart',0,0,20,12),item('article',20,0,20,100),item('link',0,100,40,20)]
 const arranged=g.arrange(huge.map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap}})),huge,800)
 expect(arranged.find(c=>c.id==='chart').h).toBe(100)
 expect(arranged.every((a,i)=>arranged.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 const short=[item('chart',0,0,20,7),item('peer',20,0,20,9),item('span',0,9,40,10)],sm=g.metrics(1000)
 const limited=g.arrange(short.map(c=>({id:c.id,preferred:{height:c.h*sm.step-sm.gap}})),short,1000)
 expect(limited.find(c=>c.id==='chart').h).toBe(9)
})

it('标准整理不跨行借用衍生组件，基准行拉齐并让后续独行铺满',()=>{
 for(const width of [1000,1230,1400]){
  const g=createResearchGrid(),m=g.metrics(width),before=[item('gold',0,0,20,8),item('chart',20,0,20,15),item('derived',0,8,20,14),item('pharma',0,22,20,8),item('table',0,30,40,9),item('summary',20,39,20,12)]
  const nodes=before.map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap},...(c.id==='derived'?{creationMode:'selection',sourceNodeIds:['gold']}:{})}))
  const next=g.arrange(nodes,before,width),at=id=>next.find(c=>c.id===id)
  expect(at('gold')).toMatchObject({x:0,y:0,h:15})
  expect(at('derived')).toMatchObject({x:0,y:15,w:40,h:14})
  expect(at('pharma')).toMatchObject({x:0,y:29,w:40,h:8})
  expect(at('chart')).toMatchObject({x:20,y:0,h:15})
  expect(at('table')).toMatchObject({x:0,y:37,w:40,h:9})
  expect(at('derived').y+at('derived').h).toBe(at('pharma').y)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
})

it('标准整理保持原行顺序，后续指标和新闻不提至通栏前',()=>{
 const g=createResearchGrid(),m=g.metrics(1000),before=[item('report',0,0,20,40),item('chart',20,0,20,12),item('span',0,40,40,8),item('metrics',20,48,20,10),item('news',20,58,20,18)]
 const nodes=before.map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,1000),at=id=>next.find(c=>c.id===id)
 expect(at('chart')).toMatchObject({x:20,y:0,h:40})
 expect(at('report')).toMatchObject({x:0,y:0,h:40})
 expect(at('metrics')).toMatchObject({x:0,y:48,w:40,h:10})
 expect(at('news')).toMatchObject({x:0,y:58,w:40,h:18})
 expect(at('span')).toMatchObject({y:40,w:40,h:8})
 expect(g.arrange(nodes,next,1000)).toEqual(next)
})

it('标准整理不把下行两卡变窄填入上行余格，行内左右顺序不变',()=>{
 const g=createResearchGrid(),m=g.metrics(1400),before=[item('report',0,0,26,40),item('chart',26,0,14,12),item('span',0,40,40,8),item('metrics',0,48,13,10),item('news',13,48,13,18)]
 const nodes=before.map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,1400),at=id=>next.find(c=>c.id===id)
 expect(at('metrics')).toMatchObject({x:0,y:48,w:20,h:18})
 expect(at('news')).toMatchObject({x:20,y:48,w:20,h:18})
 expect(at('chart').h).toBe(40);expect(at('span').y).toBe(40)
 expect(g.arrange(nodes,next,1400)).toEqual(next)
})

it('补位改变列边界后在本次整理内收敛，下一次不会再次横移无变化的组件',()=>{
 const g=createResearchGrid(),m=g.metrics(1230),before=[item('0',10,20,12,16),item('1',12,82,14,12),item('2',14,108,14,25),item('3',5,13,28,7),item('5',0,36,40,20),item('7',2,56,26,26),item('8',10,0,12,13),item('9',14,133,12,34)]
 const nodes=before.map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,1230)
 expect(g.arrange(nodes,next,1230)).toEqual(next)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
})


it('标准整理白酒看板保留每个原行，独行指标与事件分别铺满',()=>{
 for(const width of [946,1230,1400]){
  const g=createResearchGrid(),m=g.metrics(width),before=[item('candle',0,17,18,16),item('metrics',0,33,24,12),item('trend',18,0,22,14),item('relative',0,45,18,14),item('table',18,14,22,13),item('weights',18,59,22,63),item('news',24,27,16,32),item('assistant',0,0,18,17)]
  const nodes=before.map(c=>({id:c.id,containerSpec:{},preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,width),at=id=>next.find(c=>c.id===id)
  expect(at('news')).toMatchObject({x:0,w:40});expect(at('metrics')).toMatchObject({x:0,w:40})
  expect(at('news').y+at('news').h).toBe(at('metrics').y)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
  expect(g.arrange(nodes,next,width)).toEqual(next)
 }
})
it('整理医药看板消除首排左侧一格空带，保留可用的细分列',()=>{
 const g=createResearchGrid(),m=g.metrics(1000),before=[item('metrics',1,0,39,12),item('trend',1,12,24,14),item('scatter',25,12,15,13),item('table',0,26,25,14),item('pipeline',25,25,15,12),item('news',25,37,15,8)]
 const nodes=before.map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap}})),next=g.arrange(nodes,before,1000)
 expect(next.find(c=>c.id==='metrics')).toMatchObject({x:0,w:40});expect(next.find(c=>c.id==='trend')).toMatchObject({x:0,w:25})
 expect(next.find(c=>c.id==='scatter')).toMatchObject({x:25,w:15})
 expect(g.arrange(nodes,next,1000)).toEqual(next)
})

it('失败的工作台卡片参与整理补位，运行中的输入草稿仍保留落点',()=>{
 const cells=[item('revenue',20,0,20,24),item('failed',20,25,20,12),item('draft',0,40,20,12)],state=createWorkbenchGridState({getItem:()=>JSON.stringify({version:2,cells})},'failed-card')
 state.enable(1000);state.reconcile({files:[],artifacts:[{id:'revenue',kind:'generated-container',containerSpec:{},generationStatus:'completed'},{id:'failed',kind:'generated-container',generationStatus:'failed'},{id:'draft',kind:'generated-container',generationStatus:'running'}],viewport:{}})
 expect(state.get().find(c=>c.id==='failed').freePosition).toBeUndefined()
 expect(state.get().find(c=>c.id==='draft').freePosition).toBe(true)
 const g=createResearchGrid(),m=g.metrics(1000),arranged=g.arrange(state.get().map(c=>({id:c.id,preferred:{height:c.h*m.step-m.gap}})),state.get(),1000)
 expect(arranged.find(c=>c.id==='failed').y).toBe(24)
})

it('新页签首次接收已规划组件即铺满看板，跨列行上方的生成卡填满空位且完成时不跳动',()=>{
 const state=createWorkbenchGridState(null,'first-tab-generation');state.enable(1000)
 const panels=[{id:'overview',width:420,height:220},{id:'chart',width:656,height:456},{id:'comparison',width:980,height:410,workbenchSpan:true,workbenchLayoutVersion:1},{id:'news',width:656,height:340},{id:'filings',width:656,height:340}].map((n,i)=>({...n,kind:'generated-container',workbenchId:'first-page',workbenchIndex:i,sizeMode:'auto',generationStatus:'queued',x:i%2?1000:210,y:i<2?250:800+i*450}))
 let snap=state.reconcile({files:[],artifacts:panels,viewport:{y:0}})
 const before=state.get().map(({freePosition,...c})=>c)
 expect(before[0]).toMatchObject({x:0,y:0,w:20});expect(before[1]).toMatchObject({x:20,y:0,w:20})
 expect(before[0].h).toBe(before[1].h);expect(before[2]).toMatchObject({x:0,y:before[1].h,w:40})
 expect(before[3]).toMatchObject({x:0,y:before[2].y+before[2].h,w:20});expect(before[4]).toMatchObject({x:20,y:before[3].y,w:20})
 snap=state.reconcile({...snap,artifacts:snap.artifacts.map((n,i)=>i===0?{...n,generationStatus:'completed',containerSpec:{type:'table'}}:{...n,generationStatus:'running'})})
 expect(state.get().map(({freePosition,...c})=>c)).toEqual(before)
})

it('混合高度和尾部单张卡首次占满行宽，单卡页签直接满宽',()=>{
 const panels=[220,456,300].map((height,i)=>({id:'node-'+i,kind:'generated-container',workbenchId:'batch',workbenchIndex:i,sizeMode:'auto',generationStatus:'queued',width:420,height,x:250,y:300}))
 const snapshot={files:[],artifacts:panels,viewport:{y:0}}
 const group=createWorkbenchGridState(null,'closed-rows');group.enable(1000);group.reconcile(snapshot)
 const [left,right,last]=group.get()
 expect(left).toMatchObject({x:0,y:0,w:20})
 expect(right).toMatchObject({x:20,y:0,w:20,h:left.h})
 expect(last).toMatchObject({x:0,y:left.h,w:40})
 const single=createWorkbenchGridState(null,'single');single.enable(1000);single.reconcile({...snapshot,artifacts:[panels[0]]})
 expect(single.get()[0]).toMatchObject({x:0,y:0,w:40})
})

it('opens shared cards full width and keeps the local layout when shared content changes', () => {
 const values = new Map(), storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)}
 const cards = [
  {id:'one',kind:'pasted-text',x:160,y:150,width:260,height:210},
  {id:'two',kind:'pasted-text',x:160,y:390,width:260,height:210}
 ]
 const snapshot = artifacts => ({files:[],artifacts,viewport:{y:0}})
 const layout = createWorkbenchGridState(storage,'shared-layout',true)
 layout.enable(900)
 layout.receiveShared(cards)
 const initial = layout.reconcile(snapshot(cards))
 expect(initial.artifacts.map(node => node.width)).toEqual([876,876])
 layout.set(layout.get().map(cell => cell.id === 'one' ? {...cell,w:24} : cell))
 const edited = layout.reconcile(initial)
 layout.save()

 const remote = cards.map(node => ({...node,x:650,width:410,excerpt:'Remote content'}))
 layout.receiveShared(remote)
 expect(layout.reconcile(snapshot(remote)).artifacts[0]).toMatchObject({width:edited.artifacts[0].width,excerpt:'Remote content'})

 const reopened = createWorkbenchGridState(storage,'shared-layout',true)
 reopened.enable(1200)
 reopened.receiveShared([...remote,{...cards[0],id:'three'}])
 const reopenedCards = reopened.reconcile(snapshot([...remote,{...cards[0],id:'three'}])).artifacts
 expect(reopened.get().find(cell => cell.id === 'one').w).toBe(24)
 expect(reopenedCards[2].width).toBe(1176)
 expect(reopenedCards[2].y).toBeGreaterThan(reopenedCards[1].y)
})
