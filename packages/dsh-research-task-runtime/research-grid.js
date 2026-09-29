// Serialized into the hosted React runtime as well as exercised directly in tests.
export function createResearchGrid() {
  const columns=40, gap=10, inset=12
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n))
  const metrics=width=>{const available=Math.max(240,width),spacing=Math.min(gap,Math.max(0,(available-2*inset-columns*4)/(columns-1))),step=(available-2*inset+spacing)/columns;return {width:available,step,rowStep:step,cell:step-spacing,minColumns:Math.min(columns,Math.ceil((280+spacing)/step)),minRows:Math.ceil((160+spacing)/step),minDraftColumns:Math.min(columns,Math.ceil((320+spacing)/step)),minDraftRows:Math.ceil((220+spacing)/step),inset,gap:spacing,columns}}
  const minimum=(node,m)=>node?.kind==='generated-container'&&!node.containerSpec?{w:m.minDraftColumns,h:m.minDraftRows}:{w:m.minColumns,h:m.minRows}
  const bounded=n=>({...n,w:clamp(Math.round(n.w)||4,4,columns),h:clamp(Math.round(n.h)||3,3,300),x:clamp(Math.round(n.x)||0,0,columns-clamp(Math.round(n.w)||4,4,columns)),y:Math.max(0,Math.round(n.y)||0)})
  const overlap=(a,b)=>a.id!==b.id&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
  const order=(a,b)=>a.y-b.y||a.x-b.x
  function closeSmallGaps(items,width) {
    const m=metrics(width),next=items.map(bounded)
    // A spanning card forms a shared row boundary. Close a small skyline gap
    // above it, while keeping short content beside long reports independently
    // sized. Never grow across another card or fill a large void with blank UI.
    for(const target of [...next].sort(order))for(const card of next){
      if(card.id===target.id||card.w>=target.w||card.x<target.x||card.x+card.w>target.x+target.w)continue
      const missing=target.y-card.y-card.h
      const maxGrowth=Math.min(160,(card.h*m.rowStep-m.gap)*.25)
      if(missing<=0||missing*m.rowStep>maxGrowth)continue
      const grown={...card,h:card.h+missing}
      if(grown.h>300||next.some(other=>overlap(grown,other)))continue
      card.h=grown.h
    }
    return next
  }
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
  // Growing a card borrows width from its same-row neighbours before wrapping.
  // Resize always starts from the saved transaction, so reversing the pointer
  // restores each neighbour's width instead of accumulating shrinkage.
  function resize(items,target,nodes,width) {
    const original=items.find(c=>c.id===target.id)
    if(!original)return place(items,target)
    const active=bounded({...target,x:original.x,w:Math.min(target.w,columns-original.x)})
    if(['x','y','w','h'].every(k=>active[k]===original[k]))return items.map(bounded)
    if(active.w<=original.w||active.h!==original.h){const next=new Map(place(items,active).map(c=>[c.id,c]));return items.map(c=>next.get(c.id))}
    const m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n])),peers=items.filter(c=>c.id!==active.id&&c.y===original.y&&c.x>=original.x+original.w).map(bounded).sort((a,b)=>a.x-b.x)
    if(!peers.length)return place(items,active)
    const minima=peers.map(c=>Math.max(minimum(byId.get(c.id),m).w,Math.min(columns,Math.ceil((280+m.gap)/m.step))))
    const widths=peers.map(c=>c.w),kept=peers.length
    let count=kept
    while(count&&minima.slice(0,count).reduce((a,b)=>a+b,0)>columns-active.x-active.w)count--
    let deficit=Math.max(0,active.x+active.w+widths.slice(0,count).reduce((a,b)=>a+b,0)-columns)
    for(let i=0;i<count;i++){const shrink=Math.min(deficit,Math.max(0,widths[i]-minima[i]));widths[i]-=shrink;deficit-=shrink}
    let cursor=active.x+active.w
    const changed=new Map([[active.id,active]])
    peers.forEach((c,i)=>{if(i<count){changed.set(c.id,{...c,x:cursor,w:widths[i]});cursor+=widths[i]}else changed.set(c.id,{...c,y:active.y+active.h})})
    return compact(items.map(c=>changed.get(c.id)||c),active)
  }
  // A selection shares one grid delta. Clamp the whole group, rather than
  // letting a small member stop while the other cards keep changing size.
  function resizeSelection(items,ids,axis,delta,nodes,width,visibleItems=items) {
    const selected=new Set(ids),members=items.filter(c=>selected.has(c.id)),m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n]))
    if(!members.length||!delta)return items.map(bounded)
    const key=axis==='x'?'w':'h',min=c=>minimum(byId.get(c.id),m)[key],visible=new Map(visibleItems.map(c=>[c.id,c])),base=c=>(visible.get(c.id)||c)[key]
    let lower=Math.max(...members.map(c=>Math.min(base(c),min(c))-base(c))),upper=Math.max(0,Math.min(...members.map(c=>(axis==='x'?columns-(visible.get(c.id)||c).x:300)-base(c))))
    const rows=[]
    if(axis==='x')for(const y of new Set(members.map(c=>(visible.get(c.id)||c).y))){
      const first=Math.min(...members.filter(c=>(visible.get(c.id)||c).y===y).map(c=>(visible.get(c.id)||c).x)),row=visibleItems.filter(c=>c.y===y&&c.x>=first).sort((a,b)=>a.x-b.x)
      const peerMin=c=>Math.max(minimum(byId.get(c.id),m).w,Math.min(c.w,Math.ceil((280+m.gap)/m.step)))
      const count=row.filter(c=>selected.has(c.id)).length,reserved=row.reduce((sum,c)=>sum+(selected.has(c.id)?c.w:peerMin(c)),0)
      upper=Math.min(upper,Math.max(0,Math.floor((columns-first-reserved)/count)))
      rows.push({first,row,peerMin})
    }
    const change=clamp(Math.round(delta),lower,upper)
    if(!change)return items.map(bounded)
    const changed=new Map(members.map(c=>[c.id,{...c,[key]:base(c)+change,...(axis==='x'?{x:(visible.get(c.id)||c).x}:{})}]))
    if(axis==='x'&&change>0)for(const {first,row,peerMin} of rows){
      const widths=row.map(c=>changed.get(c.id)?.w??c.w)
      let deficit=Math.max(0,first+widths.reduce((sum,w)=>sum+w,0)-columns),x=first
      row.forEach((c,i)=>{let shrink=0;if(!selected.has(c.id)){shrink=Math.min(deficit,Math.max(0,widths[i]-peerMin(c)));widths[i]-=shrink;deficit-=shrink}const original=changed.get(c.id)||items.find(n=>n.id===c.id);changed.set(c.id,{...original,x,w:selected.has(c.id)||shrink?widths[i]:original.w});x+=widths[i]})
    }
    return compact(items.map(c=>changed.get(c.id)||c))
  }
  // Moving crosses a peer's midpoint before inserting above/below it. Resolve
  // compaction during the preview so release uses exactly that destination.
  function move(items,target,visibleItems=items,visibleTarget=target) {
    const active=bounded(target),original=items.find(c=>c.id===active.id)
    if(original&&['x','y','w','h'].every(k=>original[k]===active[k]))return items.map(bounded)
    const center=visibleTarget.y+visibleTarget.h/2,peers=visibleItems.filter(c=>overlap(visibleTarget,c)).sort((a,b)=>Math.abs(center-a.y-a.h/2)-Math.abs(center-b.y-b.h/2))
    const visiblePeer=peers[0],peer=items.find(c=>c.id===visiblePeer?.id)
    // Local minimum-height projection must not move a peer's physical midpoint
    // into its smaller saved frame. Only the ordering decision uses that view.
    if(peer)active.y=center>=visiblePeer.y+visiblePeer.h/2?peer.y+peer.h:peer.y
    const resolved=new Map(compact(place(items,active)).map(c=>[c.id,c]))
    return items.map(c=>resolved.get(c.id))
  }
  // Read the current canvas, not insertion order. Repeated horizontal edges
  // identify its columns even when heights change. Snap isolated offsets into
  // those columns, then fill vertical slots without stretching card content.
  function arrange(nodes,items,width,visibleHeight=0) {
    const m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n])),ordered=items.map(bounded).filter(c=>byId.has(c.id)).sort(order)
    if(!ordered.length)return items.map(bounded)
    const min=c=>minimum(byId.get(c.id),m)
    let fitted=ordered.map(c=>{const w=Math.max(c.w,min(c).w);return {...c,w,x:Math.min(c.x,columns-w)}})
    // Snapping can vacate an outer interval. Close it in this transaction,
    // rather than growing the cards again on the next Arrange invocation.
    for(let pass=0;pass<ordered.length*2+4;pass++){
    const sized=fitted,intervals=[]
    for(const c of [...sized].sort((a,b)=>a.x-b.x)){
      const last=intervals.at(-1),right=c.x+c.w
      if(last&&c.x<=last.right)last.right=Math.max(last.right,right)
      else intervals.push({left:c.x,right})
    }
    const used=intervals.reduce((sum,r)=>sum+r.right-r.left,0)
    const edge=value=>Math.round(intervals.reduce((sum,r)=>sum+clamp(value-r.left,0,r.right-r.left),0)/used*columns)
    const mapped=sized.map(c=>({...c,x:edge(c.x),w:edge(c.x+c.w)-edge(c.x)})),counts=new Map()
    for(const c of mapped)for(const at of [c.x,c.x+c.w])counts.set(at,(counts.get(at)||0)+1)
    let boundaries=[0,...[...counts].filter(([at,count])=>at>0&&at<columns&&count>1).map(([at])=>at),columns].sort((a,b)=>a-b)
    if(boundaries.length===2){const lanes=Math.max(1,Math.min(3,ordered.length,Math.floor(columns/Math.max(...ordered.map(c=>min(c).w)))));boundaries=Array.from({length:lanes+1},(_,i)=>Math.round(i*columns/lanes))}
    const slot=c=>{
      let best
      for(let i=0;i<boundaries.length-1;i++)for(let j=i+1;j<boundaries.length;j++){
        const x=boundaries[i],w=boundaries[j]-x
        if(w<min(c).w)continue
        const score=Math.abs(w-c.w)*2+Math.abs(x+w/2-(c.x+c.w/2))
        if(!best||score<best.score)best={x,w,score}
      }
      return best
    }
    const next=mapped.map(c=>{const target=slot(c);return {...c,x:target.x,w:target.w}})
    if(next.every((c,i)=>c.x===fitted[i].x&&c.w===fitted[i].w))break
    fitted=next
    }
    const planned=fitted.map(c=>{
      const n=byId.get(c.id),p=n.preferred||n
      return {...c,h:clamp(Math.max(min(c).h,Math.ceil(((p.height||260)+m.gap)/m.rowStep)),3,300)}
    })
    const result=new Map(closeSmallGaps(compact(planned),width).map(c=>[c.id,c]));return items.map(c=>result.get(c.id)||bounded(c))
  }
  function append(items,id,w=20,h=7){return bounded({id,x:0,y:Math.max(0,...items.map(n=>n.y+n.h)),w,h})}
  function draw(a,b,m){
    // A pointer inside a painted square selects that square. In a gutter,
    // choose the nearer square; both drag directions use the same bounds.
    const index=value=>{const at=(value-inset)/m.step,whole=Math.floor(at);return whole+((at-whole)*m.step>m.cell+m.gap/2?1:0)}
    const ax=index(a.x),ay=index(a.y),bx=index(b.x),by=index(b.y)
    const x=clamp(Math.min(ax,bx),0,columns-m.minDraftColumns),y=Math.max(0,Math.min(ay,by))
    const right=clamp(Math.max(ax,bx)+1,x+m.minDraftColumns,columns)
    const bottom=Math.max(y+m.minDraftRows,Math.max(ay,by)+1)
    return bounded({id:'__draft__',x,y,w:right-x,h:bottom-y})
  }
  function migrate(nodes,width){
    const m=metrics(width), ordered=[...nodes].sort((a,b)=>a.y-a.height/2-(b.y-b.height/2)||a.x-b.x)
    const oldLeft=Math.min(0,...ordered.map(n=>n.x-n.width/2)),oldRight=Math.max(width-2*inset,...ordered.map(n=>n.x+n.width/2))-oldLeft
    const oldTop=Math.min(0,...ordered.map(n=>n.y-n.height/2))
    return compact(ordered.map(n=>bounded({id:n.id,x:Math.round((n.x-n.width/2-oldLeft)/oldRight*columns),y:Math.max(0,Math.round((n.y-n.height/2-oldTop)/m.rowStep)),w:clamp(Math.round(n.width/oldRight*columns),8,columns),h:Math.max(m.minRows,Math.ceil((n.height+m.gap)/m.rowStep))})))
  }
  function project(nodes,items,width){
    const m=metrics(width), byId=new Map(items.map(n=>[n.id,n]))
    return nodes.map(n=>{const c=byId.get(n.id);if(!c)return n;const width=c.w*m.step-m.gap,height=c.h*m.rowStep-m.gap;return {...n,x:inset+c.x*m.step+width/2,y:inset+c.y*m.rowStep+height/2,width,height,sizeMode:'manual'}})
  }
  return {columns,gap,inset,metrics,minimum,bounded,overlap,compact,closeSmallGaps,place,resize,resizeSelection,move,arrange,append,draw,migrate,project}
}
