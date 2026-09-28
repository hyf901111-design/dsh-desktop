// Serialized into the hosted React runtime as well as exercised directly in tests.
export function createResearchGrid() {
  const columns=40, gap=10, row=25, inset=12
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n))
  const metrics=width=>({width:Math.max(240,width),step:(Math.max(240,width)-2*inset+gap)/columns,rowStep:row+gap,inset,gap,columns})
  const bounded=n=>({...n,w:clamp(Math.round(n.w)||4,4,columns),h:clamp(Math.round(n.h)||3,3,300),x:clamp(Math.round(n.x)||0,0,columns-clamp(Math.round(n.w)||4,4,columns)),y:Math.max(0,Math.round(n.y)||0)})
  const overlap=(a,b)=>a.id!==b.id&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
  const order=(a,b)=>a.y-b.y||a.x-b.x
  function compact(items,pinned=null) {
    const sorted=items.map(bounded).sort(order), settled=[]
    if(pinned)settled.push(bounded(pinned))
    for(const n of sorted){
      if(n.id===pinned?.id)continue
      // First resolve collisions downward, then rise only through unobstructed cells.
      let collisions=settled.filter(p=>overlap(n,p))
      while(collisions.length){n.y=Math.max(...collisions.map(p=>p.y+p.h));collisions=settled.filter(p=>overlap(n,p))}
      while(n.y>0&&!settled.some(p=>overlap({...n,y:n.y-1},p)))n.y--
      settled.push(n)
    }
    const byId=new Map(settled.map(n=>[n.id,n]))
    return items.map(n=>byId.get(n.id))
  }
  function place(items,target,id=target.id) {
    const active=bounded({...target,id}), rest=items.filter(n=>n.id!==id).map(bounded)
    // Colliding peers start underneath the pointer's occupied slot. Cascades
    // retain their previous order, including unequal height cards.
    for(const n of rest)if(overlap(n,active))n.y=active.y+active.h
    return compact([...rest,active],active)
  }
  function append(items,id,w=20,h=7){return bounded({id,x:0,y:Math.max(0,...items.map(n=>n.y+n.h)),w,h})}
  function draw(a,b,m){
    const x=clamp(Math.round((Math.min(a.x,b.x)-inset)/m.step),0,columns-4),y=Math.max(0,Math.round((Math.min(a.y,b.y)-inset)/m.rowStep))
    const right=clamp(Math.round((Math.max(a.x,b.x)-inset+gap)/m.step),x+4,columns)
    const bottom=Math.max(y+3,Math.round((Math.max(a.y,b.y)-inset+gap)/m.rowStep))
    return bounded({id:'__draft__',x,y,w:right-x,h:bottom-y})
  }
  function migrate(nodes,width){
    const m=metrics(width), ordered=[...nodes].sort((a,b)=>a.y-a.height/2-(b.y-b.height/2)||a.x-b.x)
    const oldLeft=Math.min(0,...ordered.map(n=>n.x-n.width/2)),oldRight=Math.max(width-2*inset,...ordered.map(n=>n.x+n.width/2))-oldLeft
    const oldTop=Math.min(0,...ordered.map(n=>n.y-n.height/2))
    return compact(ordered.map(n=>bounded({id:n.id,x:Math.round((n.x-n.width/2-oldLeft)/oldRight*columns),y:Math.max(0,Math.round((n.y-n.height/2-oldTop)/m.rowStep)),w:clamp(Math.round(n.width/oldRight*columns),8,columns),h:Math.ceil((n.height+gap)/m.rowStep)})))
  }
  function project(nodes,items,width){
    const m=metrics(width), byId=new Map(items.map(n=>[n.id,n]))
    return nodes.map(n=>{const c=byId.get(n.id);if(!c)return n;const width=c.w*m.step-gap,height=c.h*m.rowStep-gap;return {...n,x:inset+c.x*m.step+width/2,y:inset+c.y*m.rowStep+height/2,width,height,sizeMode:'manual'}})
  }
  return {columns,gap,row,inset,metrics,bounded,overlap,compact,place,append,draw,migrate,project}
}
