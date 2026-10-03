import {it,expect} from 'vitest'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'

const cell=(id,x,y,w=20,h=10)=>({id,x,y,w,h})
const nodes=ids=>ids.map(id=>({id,kind:'pasted-text',preferred:{height:260}}))

it('三排整理按当前阅读顺序形成三列，不按创建顺序重排',()=>{
 const g=createResearchGrid(),items=[cell('d',0,40),cell('b',20,0),cell('c',0,20),cell('a',0,0)]
 const n=nodes(['d','c','b','a']),next=g.arrange(n,items,1200,700,'three'),at=id=>next.find(c=>c.id===id)
 expect(at('a')).toMatchObject({x:0,y:0,w:13})
 expect(at('b')).toMatchObject({x:13,y:0,w:14})
 expect(at('c')).toMatchObject({x:27,y:0,w:13})
 expect(at('d')).toMatchObject({x:0,y:at('a').h,w:13})
 expect(g.arrange(n,next,1200,700,'three')).toEqual(next)
 expect(next.map(c=>c.id)).toEqual(items.map(c=>c.id))
})

it('双排保持各自内容高度，后一行从前一行下方开始',()=>{
 const g=createResearchGrid(),items=[cell('a',0,0),cell('b',20,0),cell('c',0,20)],n=nodes(['a','b','c'])
 n[1].preferred.height=600
 const next=g.arrange(n,items,1000,700,'two'),[a,b,c]=next
 expect(a).toMatchObject({x:0,w:20,y:0});expect(b).toMatchObject({x:20,w:20,y:0})
 expect(b.h).toBeGreaterThan(a.h);expect(c.y).toBe(b.h)
 expect(next.every((c,i)=>next.every((p,j)=>i===j||!g.overlap(c,p)))).toBe(true)
 expect(g.arrange(n,next,1000,700,'two')).toEqual(next)
})

it('单排占满可用宽度并按当前空间顺序连续排列',()=>{
 const g=createResearchGrid(),items=[cell('right',20,0),cell('left',0,0),cell('bottom',20,30)]
 const next=g.arrange(nodes(['bottom','right','left']),items,1000,700,'one'),at=id=>next.find(c=>c.id===id)
 expect(next.every(c=>c.x===0&&c.w===40)).toBe(true)
 expect(at('left').y).toBe(0);expect(at('right').y).toBe(at('left').h);expect(at('bottom').y).toBe(at('left').h+at('right').h)
})

it('标准整理保留当前不等宽列和列内顺序，补齐空位',()=>{
 const g=createResearchGrid(),items=[cell('rb',24,40,16),cell('lb',0,40,24),cell('rt',24,0,16),cell('lt',0,0,24)]
 const n=nodes(['rb','lb','rt','lt']),next=g.arrange(n,items,1200,700,'standard'),at=id=>next.find(c=>c.id===id)
 expect(at('lt')).toMatchObject({x:0,y:0,w:24});expect(at('rt')).toMatchObject({x:24,y:0,w:16})
 expect(at('lb')).toMatchObject({x:0,y:at('lt').h,w:24});expect(at('rb')).toMatchObject({x:24,y:at('rt').h,w:16})
 expect(next).toEqual(g.arrange(n,items,1200,700))
})

it('窄画布三排自动适配而不突破统一最小阅读宽度',()=>{
 const g=createResearchGrid(),items=['a','b','c'].map((id,i)=>cell(id,0,i*20)),n=nodes(['a','b','c'])
 const next=g.arrange(n,items,640,700,'three'),shown=g.project(n,next,640)
 expect(next.slice(0,2).map(c=>[c.x,c.w,c.y])).toEqual([[0,20,0],[20,20,0]])
 expect(shown.every(n=>n.width>=280)).toBe(true)
 expect(g.arrange(n,items,320,700,'three').every(c=>c.w===40)).toBe(true)
})

it('固定排数内容重新测量后仍保留三列并重新计算行高',()=>{
 const g=createResearchGrid(),n=nodes(['a','b','c','d']),items=n.map((n,i)=>cell(n.id,0,i*20))
 const first=g.arrange(n,items,1200,700,'three');n[1].preferred.height=900
 const next=g.arrange(n,first,1200,700,'three')
 expect(next.slice(0,3).map(c=>c.x)).toEqual([0,13,27]);expect(next[3].y).toBe(next[1].h)
 expect(next.every((c,i)=>next.every((p,j)=>i===j||!g.overlap(c,p)))).toBe(true)
})
