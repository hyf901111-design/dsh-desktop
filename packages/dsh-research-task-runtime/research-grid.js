// Serialized into the hosted React runtime as well as exercised directly in tests.
export function createResearchGrid() {
  const columns=40, gap=10, inset=12
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n))
  const metrics=width=>{const available=Math.max(240,width),spacing=Math.min(gap,Math.max(0,(available-2*inset-columns*4)/(columns-1))),step=(available-2*inset+spacing)/columns;return {width:available,step,rowStep:step,cell:step-spacing,minRows:Math.ceil(105/step),minDraftColumns:Math.min(columns,Math.ceil((320+spacing)/step)),minDraftRows:Math.ceil((220+spacing)/step),inset,gap:spacing,columns}}
  const minimum=(node,m)=>node?.kind==='generated-container'&&!node.containerSpec?{w:m.minDraftColumns,h:m.minDraftRows}:{w:4,h:m.minRows}
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
  // Widths fill each shelf; each card keeps its own intrinsic content height.
  // Compact the finished shelves into shorter columns instead of filling cards
  // with blank space. Source order makes repeated Arrange deterministic.
  function arrange(nodes,items,width,visibleHeight=0) {
    const m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n])),cellsById=new Map(items.map(n=>[n.id,bounded(n)])),ordered=nodes.map(n=>cellsById.get(n.id)).filter(Boolean)
    const preferred=ordered.map(c=>{const n=byId.get(c.id)||{},p=n.preferred||n,min=minimum(n,m),minWidth=Math.min(m.width-2*inset,n.kind==='generated-container'&&!n.containerSpec?320:280);return {w:Math.max(minWidth,Math.min(m.width-2*inset,p.width||480)),h:Math.max(min.h*m.step-m.gap,p.height||260),minCols:Math.min(columns,Math.ceil((minWidth+m.gap)/m.step)),minRows:min.h}})
    const maxPeers=Math.max(1,Math.min(3,Math.floor((width-2*inset+gap)/300))),cost=Array(ordered.length+1).fill(Infinity),choices=[];cost[ordered.length]=0
    for(let start=ordered.length-1;start>=0;start--)for(let count=1;count<=Math.min(maxPeers,ordered.length-start);count++){
      const peers=preferred.slice(start,start+count),sum=peers.reduce((v,p)=>v+p.w,0),scale=(width-2*inset-(count-1)*gap)/sum
      if(peers.reduce((v,p)=>v+p.minCols,0)>columns)continue
      const heights=peers.map(p=>p.h),mismatch=Math.max(...heights)/Math.min(...heights)-1
      const score=cost[start+count]+Math.abs(Math.log(scale))*2+Math.max(0,1-scale)*2+mismatch*.7+.2
      if(score<cost[start]){cost[start]=score;choices[start]=count}
    }
    const shelves=[];let y=0
    for(let start=0;start<ordered.length;){const count=choices[start]||1,peers=preferred.slice(start,start+count),sum=peers.reduce((v,p)=>v+p.w,0)
      let x=0;const shelf=[]
      for(let j=0;j<count;j++){const w=j===count-1?columns-x:clamp(Math.round(peers[j].w/sum*columns),peers[j].minCols,columns-x-peers.slice(j+1).reduce((v,p)=>v+p.minCols,0)),h=clamp(Math.max(peers[j].minRows,Math.ceil((peers[j].h+m.gap)/m.rowStep)),3,300);shelf.push({...ordered[start+j],x,y,w,h});x+=w}
      const h=Math.max(...shelf.map(c=>c.h))
      shelves.push({cells:shelf,h});y+=h;start+=count
    }
    const result=compact(shelves.flatMap(s=>s.cells))
    const resultById=new Map(result.map(c=>[c.id,c]));return items.map(c=>resultById.get(c.id))
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
  return {columns,gap,inset,metrics,minimum,bounded,overlap,compact,place,resize,move,arrange,append,draw,migrate,project}
}
