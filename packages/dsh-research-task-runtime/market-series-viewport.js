// Serialized with the trusted market runtimes. One SVG unit is one CSS pixel:
// resize changes plotting coordinates, never the shape or size of its type.
export function marketSeriesViewport(svg, axisLabels) {
 const rect=svg.getBoundingClientRect(),width=Math.round(rect.width)||506,height=Math.round(rect.height)||164
 const left=Math.min(width*.32,Math.max(32,...axisLabels.map(label=>String(label).length*6.5+12))),right=Math.max(left+1,width-8),top=12,bottom=Math.max(top+1,height-26)
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('preserveAspectRatio','xMidYMid meet')
 const x=(index,length)=>left+(right-left)*index/Math.max(1,length-1)
 const dates=(labels,start,length,preferred=6)=>{
  const end=start+length-1,first=labels[start],last=labels[end],sameDay=first.slice(0,10)===last.slice(0,10),sameYear=first.slice(0,4)===last.slice(0,4)
  const compact=label=>{
   const iso=label.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/)
   if(iso)return sameDay?iso[4]+(iso[5]==='Z'?'Z':iso[5]||''):(sameYear?'':iso[1].slice(2)+'/')+iso[2]+'/'+iso[3]+' '+iso[4]+(iso[5]==='Z'?'Z':iso[5]||'')
   if(/^\d{4}-\d{2}-\d{2}$/.test(label))return sameYear?label.slice(5).replace('-','/'):label.slice(2).replaceAll('-','/')
   return label.length>12?label.slice(0,11)+'…':label
  }
  const formatted=labels.slice(start,start+length).map(compact),labelWidth=Math.max(54,...formatted.map(label=>[...label].reduce((n,c)=>n+(c.charCodeAt(0)>255?11:6.5),0)))
  const count=Math.max(2,Math.min(length,preferred,Math.floor((right-left)/(labelWidth+32))+1)),indices=[...new Set(Array.from({length:count},(_,i)=>Math.round(i*(length-1)/(count-1))))]
  for(const index of indices){
   const text=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','text')
   for(const [key,value] of Object.entries({'data-series-date':'',x:x(index,length),y:height-7,'text-anchor':index===0?'start':index===length-1?'end':'middle'}))text.setAttribute(key,String(value))
   text.textContent=formatted[index]
   const title=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=labels[start+index];text.appendChild(title);svg.appendChild(text)
  }
 }
 return {width,height,left,right,top,bottom,x,dates}
}

export function observeMarketSeries(svg, draw) {
 const win=svg.ownerDocument.defaultView
 let frame=0,disposed=false,key=''
 const schedule=()=>{
  if(disposed)return
  const rect=svg.getBoundingClientRect(),next=Math.round(rect.width)+':'+Math.round(rect.height)
  if(next===key)return;key=next
  if(frame)return
  if(typeof win.requestAnimationFrame!=='function'){draw();return}
  frame=win.requestAnimationFrame(()=>{frame=0;if(!disposed)draw()})
 }
 const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(schedule):null
 observer?.observe(svg);win.addEventListener('resize',schedule)
 const stop=()=>{disposed=true;if(frame)win.cancelAnimationFrame(frame);observer?.disconnect();win.removeEventListener('resize',schedule)}
 win.addEventListener('pagehide',stop,{once:true});schedule()
 return stop
}
