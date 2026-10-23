import {expect,it} from 'vitest'
import {Window} from 'happy-dom'
import {readableTrendFigure} from '../packages/dsh-research-task-runtime/component-readable-chart.js'

const fixture=(values=[-2,0,2])=>({type:'chart',variant:'line',title:'实际趋势',unit:'件',labels:values.map((_,i)=>'期间'+i),series:[{name:'实际序列',values}]})
function dom(data,check){
 const window=new Window()
 try{window.document.body.innerHTML=readableTrendFigure(data)??'';check(window.document)}finally{window.happyDOM.abort()}
}
const points=line=>line.getAttribute('points').trim().split(/\s+/u).map(point=>point.split(',').map(Number))
it('plots true zero and negative values on the same finite scale without changing source data',()=>{
 const data=fixture(),before=structuredClone(data)
 dom(data,document=>{
  const p=points(document.querySelector('polyline'))
  expect(p).toHaveLength(3);expect(p[0][1]).toBeGreaterThan(p[1][1]);expect(p[1][1]).toBeGreaterThan(p[2][1])
  expect(p[1][1]).toBeCloseTo((p[0][1]+p[2][1])/2,3)
  expect(p.flat().every(Number.isFinite)).toBe(true)
  expect(document.querySelector('[data-readable-unit]').textContent).toBe('件')
  expect([...document.querySelectorAll('[data-readable-axis-label]')].map(node=>node.textContent)).toEqual(data.labels)
 })
 expect(data).toEqual(before)
})
it('breaks at every missing point and displays isolated valid zeroes as circles',()=>{
 dom(fixture([1,2,null,0,null,-2,-1,null]),document=>{
  expect([...document.querySelectorAll('polyline')].map(line=>points(line).length)).toEqual([2,2])
  const circle=document.querySelector('circle');expect(circle).not.toBeNull();expect(circle.getAttribute('data-readable-index')).toBe('3')
  expect(circle.getAttribute('data-readable-value')).toBe('0')
  expect(document.querySelectorAll('[data-readable-series]')).toHaveLength(1)
  expect(document.querySelector('[data-readable-series]').getAttribute('data-readable-valid-points')).toBe('5')
 })
})
it.each([[0],[-7],[null,8,null],[4,4,4]].map(values=>({values})))('makes a single value or constant series visible: $values',({values})=>{
 dom(fixture(values),document=>{
  const marks=[...document.querySelectorAll('polyline,circle')]
  expect(marks.length).toBeGreaterThan(0)
  for(const mark of marks){
   const coords=mark.tagName.toLowerCase()==='circle'?[Number(mark.getAttribute('cx')),Number(mark.getAttribute('cy'))]:points(mark).flat()
   expect(coords.every(Number.isFinite)).toBe(true)
  }
  if(values.filter(value=>value!==null).length===1)expect(document.querySelector('circle')).not.toBeNull()
 })
})
it('does not draw all-null data, coerce numeric text, or invent an unsupported chart variant',()=>{
 expect(readableTrendFigure(fixture([null,null]))).toBeNull()
 expect(readableTrendFigure(fixture(['0',1]))).toBeNull()
 expect(readableTrendFigure(fixture([Number.NaN,1]))).toBeNull()
 expect(readableTrendFigure({...fixture(),variant:'bar'})).toBeNull()
 expect(readableTrendFigure({...fixture(),type:'market',variant:'metrics'})).toBeNull()
 expect(readableTrendFigure({...fixture(),labels:['wrong length']})).toBeNull()
})
it.each(['chart','market'])('retains every point and series for an 800-point %s trend with actual first/middle/last labels',type=>{
 const data={...fixture(),type,variant:type==='chart'?'line':'trend',labels:Array.from({length:200},(_,i)=>'完整第'+i+'期'),series:Array.from({length:4},(_,i)=>({name:'序列'+i,values:Array.from({length:200},(_,n)=>i*200+n-2)}))}
 dom(data,document=>{
  const series=[...document.querySelectorAll('[data-readable-series]')]
  expect(series).toHaveLength(4)
  expect(series.reduce((n,node)=>n+points(node.querySelector('polyline')).length,0)).toBe(800)
  expect([...document.querySelectorAll('[data-readable-legend-item]')].map(node=>node.textContent)).toEqual(data.series.map(series=>series.name))
  expect([...document.querySelectorAll('[data-readable-axis-label]')].map(node=>node.textContent)).toEqual(['完整第0期','完整第99期','完整第199期'])
  expect(document.querySelector('svg').getAttribute('viewBox').split(' ').map(Number).every(Number.isFinite)).toBe(true)
 })
})
it('retains all 367 periods without array slicing or a last-period omission',()=>{
 const data=fixture(Array.from({length:367},(_,i)=>i-200))
 dom(data,document=>{
  expect(points(document.querySelector('polyline'))).toHaveLength(367)
  expect(document.querySelector('[data-readable-axis-label]:last-child').textContent).toBe('期间366')
 })
})
it('escapes all source text in attributes, legends, units and complete wrapping axis labels',()=>{
 const hostile='<img src=x onerror="alert(1)"> & </text><script>bad()</script>',data=fixture([0,-1,1])
 data.title=hostile;data.unit=hostile;data.series[0].name=hostile;data.labels.fill(hostile)
 dom(data,document=>{
  expect(document.querySelector('img,script,foreignObject')).toBeNull()
  expect(document.querySelector('svg').getAttribute('aria-label')).toBe(hostile)
  expect(document.querySelector('[data-readable-legend-item]').textContent).toBe(hostile)
  expect(document.querySelector('[data-readable-unit]').textContent).toBe(hostile)
  expect([...document.querySelectorAll('[data-readable-axis-label]')].every(node=>node.textContent===hostile&&node.style.overflowWrap==='anywhere')).toBe(true)
  expect([...document.querySelectorAll('*')].flatMap(node=>[...node.attributes]).some(attribute=>/^on/iu.test(attribute.name))).toBe(false)
 })
})
it('keeps coordinates finite for very large and very small finite values',()=>{
 for(const values of [[-Number.MAX_VALUE,0,Number.MAX_VALUE],[Number.MIN_VALUE,Number.MIN_VALUE*2,Number.MIN_VALUE*3]])dom(fixture(values),document=>{
  expect(points(document.querySelector('polyline')).flat().every(Number.isFinite)).toBe(true)
 })
})
