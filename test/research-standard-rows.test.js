import {expect,it} from 'vitest'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'

const node=(id,height)=>({id,kind:'generated-container',containerSpec:{type:'table'},preferred:{height}})
const at=(cells,id)=>cells.find(cell=>cell.id===id)
const noOverlap=(grid,cells)=>expect(cells.every((cell,i)=>cells.every((other,j)=>i===j||!grid.overlap(cell,other)))).toBe(true)

it('标准整理保持截图中的笔记表格同行，拉高短表填洞，下行时间线不提上来且铺满',()=>{
 const grid=createResearchGrid(),nodes=[node('note',1040),node('table',280),node('timeline',620)]
 const original=[{id:'note',x:0,y:0,w:20,h:44},{id:'table',x:20,y:0,w:20,h:12},{id:'timeline',x:0,y:48,w:20,h:26}]
 const next=grid.arrange(nodes,original,1000,700,'standard'),note=at(next,'note'),table=at(next,'table'),timeline=at(next,'timeline')
 expect(note).toMatchObject({x:0,y:0,w:20});expect(table).toMatchObject({x:20,y:0,w:20,h:note.h})
 expect(timeline).toMatchObject({x:0,w:40,y:note.h});noOverlap(grid,next)
 expect(grid.arrange(nodes,next,1000,700,'standard')).toEqual(next)
})

it('标准整理按原行分组，不把下行组件变窄填上行，保留同行左右顺序与宽比',()=>{
 const grid=createResearchGrid(),nodes=[node('later',280),node('right',300),node('left',900)]
 const original=[{id:'later',x:0,y:50,w:40,h:12},{id:'right',x:24,y:0,w:16,h:12},{id:'left',x:0,y:0,w:24,h:38}]
 const next=grid.arrange(nodes,original,1200,700),left=at(next,'left'),right=at(next,'right')
 expect(left).toMatchObject({x:0,y:0,w:24});expect(right).toMatchObject({x:24,y:0,w:16,h:left.h})
 expect(at(next,'later')).toMatchObject({x:0,w:40,y:left.h});noOverlap(grid,next)
})

it('整理前独占一行的窄组件横向铺满可用画板，离屏行同样生效',()=>{
 const grid=createResearchGrid(),nodes=[node('first',260),node('offscreen',600)],original=[{id:'first',x:10,y:0,w:20,h:12},{id:'offscreen',x:8,y:400,w:18,h:24}]
 const next=grid.arrange(nodes,original,1000,700)
 expect(at(next,'first')).toMatchObject({x:0,y:0,w:40});expect(at(next,'offscreen')).toMatchObject({x:0,w:40,y:at(next,'first').h});noOverlap(grid,next)
})

it('原生与网页测高回报后保持同行共同高度，短卡不会在refit重新缩回',()=>{
 const grid=createResearchGrid(),nodes=[node('long',900),node('short',220),node('following',260)],original=[{id:'long',x:0,y:0,w:20,h:38},{id:'short',x:20,y:0,w:20,h:10},{id:'following',x:0,y:50,w:20,h:12}]
 const first=grid.arrange(nodes,original,1000,700)
 for(const height of [180,420,1100]){
  const updated=nodes.map(n=>n.id==='short'?{...n,preferred:{height}}:n),next=grid.arrange(updated,first,1000,700)
  expect(at(next,'long').h).toBe(at(next,'short').h);expect(at(next,'following')).toMatchObject({x:0,w:40,y:at(next,'long').h});noOverlap(grid,next)
  expect(grid.arrange(updated,next,1000,700)).toEqual(next)
 }
})

it('标准整理保留当前同行宽表，980px模板推荐不强拆行；确实窄于通用下限才拆行',()=>{
 const grid=createResearchGrid(),nodes=['watchlist','historical-price'].map(id=>({...node(id,400),containerSpec:{type:'html',html:'<body data-sherlock-market="'+id+'"></body>'}})),before=[{id:'watchlist',x:0,y:0,w:20,h:20},{id:'historical-price',x:20,y:0,w:20,h:20}]
 const standard=grid.arrange(nodes,before,1000)
 expect(standard.map(c=>[c.x,c.y,c.w])).toEqual([[0,0,20],[20,0,20]])
 const narrow=grid.arrange(nodes,before,500);expect(narrow.every(c=>c.x===0&&c.w===40)).toBe(true);expect(narrow[1].y).toBe(narrow[0].h)
 noOverlap(grid,narrow)
 for(const mode of ['one','two','three']){const chosen=grid.arrange(nodes,before,1000,700,mode);expect(chosen.every(c=>c.arrangeColumns===({one:1,two:2,three:3}[mode]))).toBe(true)}
})
