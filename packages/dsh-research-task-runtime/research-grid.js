// Serialized into the hosted React runtime as well as exercised directly in tests.
export function createResearchGrid() {
  const columns=40, gap=10, inset=12
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n))
  const metrics=width=>{const available=Math.max(240,width),spacing=Math.min(gap,Math.max(0,(available-2*inset-columns*4)/(columns-1))),step=(available-2*inset+spacing)/columns;return {width:available,step,rowStep:step,cell:step-spacing,minColumns:Math.min(columns,Math.ceil((280+spacing)/step)),minRows:Math.ceil((160+spacing)/step),minDraftColumns:Math.min(columns,Math.ceil((320+spacing)/step)),minDraftRows:Math.ceil((220+spacing)/step),inset,gap:spacing,columns}}
  const minimum=(node,m,arranging=false)=>{
    // A compact typed watchlist in the authored workbench has a different
    // reading floor from report/chart panels. Use the same policy for normal
    // projection and Standard Arrange so later packing cannot widen it again.
    if(node?.workbenchLayoutVersion===1&&typeof node.workbenchId==='string'&&node.workbenchId.startsWith('hwb:')&&node.id===node.workbenchId+':watchlist'&&node?.containerSpec?.type==='financial-widget'&&node.containerSpec.widget==='watchlist'&&node.workbenchSpan!==true)return {w:Math.min(columns,Math.ceil((230+m.gap)/m.step)),h:m.minRows}
    // Manual resizing uses one base frame for every component. Readable
    // template widths guide Arrange only; titles never constrain the frame.
    if(!arranging)return {w:m.minColumns,h:m.minRows}
    if(node?.workbenchSpan===true&&node.workbenchLayoutVersion===1||/<body\b[^>]*data-research-kind="gantt"/.test(node?.containerSpec?.html??''))return {w:columns,h:m.minRows}
    // Wide quote templates need their first identifying and value columns.
    // Only the current body's kind establishes this; shared CSS lists every kind.
    const kind=node?.containerSpec?.type==='html'&&node.containerSpec.html?.match(/<body\b[^>]*data-sherlock-market="([a-z-]+)"/)?.[1]
    const readable={charting:980,'stock-ownership':980,'company-filings':980,'historical-price':980,'insider-trading':980,'institutional-ownership':980,dividends:980,'stock-splits':320,'revenue-geography':980,'revenue-business':980,'share-statistics':320,'market-overview':980,'currency-snapshot':980,'watchlist':980,'price-performance':980,'valuation-multiples':980,'price-target':980,'company-profile':980,'financial-statements':980}[kind]
    if(readable)return {w:Math.min(columns,Math.ceil((readable+m.gap)/m.step)),h:m.minRows}
    if(!['generated-container','planning-card'].includes(node?.kind)||node.containerSpec)return {w:m.minColumns,h:m.minRows}
    // Task status changes content, never the frame. Keep the draft minimum
    // throughout generation; the derived shell also reserves its source strip.
    const height=node.creationMode==='selection'?330:220
    return {w:m.minDraftColumns,h:Math.ceil((height+m.gap)/m.rowStep)}
  }
  const bounded=n=>({...n,w:clamp(Math.round(n.w)||4,4,columns),h:clamp(Math.round(n.h)||3,3,300),x:clamp(Math.round(n.x)||0,0,columns-clamp(Math.round(n.w)||4,4,columns)),y:Math.max(0,Math.round(n.y)||0)})
  const overlap=(a,b)=>a.id!==b.id&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
  const order=(a,b)=>a.y-b.y||a.x-b.x
  function closeSmallGaps(items,width) {
    const m=metrics(width),next=items.map(bounded)
    // A spanning card forms a shared row boundary. Close a small skyline gap
    // above it, while keeping short content beside long reports independently
    // sized. Never grow across another card or fill a large void with blank UI.
    for(const target of [...next].sort(order))for(const card of next){
      if(card.freePosition||card.id===target.id||card.w>=target.w||card.x<target.x||card.x+card.w>target.x+target.w)continue
      const missing=target.y-card.y-card.h
      const maxGrowth=Math.min(160,(card.h*m.rowStep-m.gap)*.25)
      if(missing<=0||missing*m.rowStep>maxGrowth)continue
      const grown={...card,h:card.h+missing}
      if(grown.h>300||next.some(other=>overlap(grown,other)))continue
      card.h=grown.h
    }
    return next
  }
  function closeColumnGaps(items) {
    const next=compact(items)
    // A full-width first row can mask an empty strip further down. Use the
    // actual neighbours alongside each card, not the union of all X intervals.
    // Extend into that strip only when the entire new rectangle is unobstructed.
    for(const card of [...next].sort(order)){
      if(card.freePosition||card.x===0)continue
      const beside=next.filter(c=>c.id!==card.id&&c.y<card.y+card.h&&c.y+c.h>card.y&&c.x+c.w<=card.x)
      if(!beside.length)continue
      const x=Math.max(...beside.map(c=>c.x+c.w))
      if(x===card.x)continue
      const grown={...card,x,w:card.x+card.w-x}
      if(next.some(other=>overlap(grown,other)))continue
      card.x=grown.x;card.w=grown.w
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
      while(!n.freePosition&&n.y>0&&!settled.some(p=>overlap({...n,y:n.y-1},p)))n.y--
      settled.push(n)
    }
    const byId=new Map(settled.map(n=>[n.id,n]))
    return items.map(n=>byId.get(n.id))
  }
  function fillVacancies(items,nodes,width) {
    let next=compact(items)
    const m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n])),related=new Set()
    for(const n of nodes)if(n.creationMode==='selection'){related.add(n.id);for(const id of n.sourceNodeIds||[])related.add(id)}
    // Prefer a neighbouring column's last card. Only when that cannot help,
    // pull the next cards into a vacant slot above a spanning row boundary.
    // Width and content height remain intact; this never stretches a chart
    // to the height of a report or changes the order within a source group.
    for(let pass=0;pass<items.length*items.length;pass++){
      let best
      for(const target of [...next].sort(order)){
        const inside=c=>c.x>=target.x&&c.x+c.w<=target.x+target.w
        const previous=next.filter(c=>c.id!==target.id&&inside(c)&&c.y+c.h<=target.y)
        const blockTop=Math.max(0,...previous.filter(c=>c.w>=target.w).map(c=>c.y+c.h))
        const followingBoundary=Math.min(Infinity,...next.filter(c=>c.id!==target.id&&inside(c)&&c.w>=target.w&&c.y>=target.y+target.h).map(c=>c.y))
        const edges=new Set([target.x,target.x+target.w,...previous.flatMap(c=>[c.x,c.x+c.w])])
        for(const card of next){
          if(card.freePosition||card.w>=target.w||!inside(card)||related.has(card.id)||['queued','running','retrying'].includes(byId.get(card.id)?.generationStatus))continue
          const earlier=card.y+card.h<=target.y&&card.y>=blockTop,later=card.y>=target.y+target.h&&card.y<followingBoundary
          if(!earlier&&!later)continue
          const intersects=c=>c.x<card.x+card.w&&c.x+c.w>card.x
          // Do not take a middle card out of an existing column sequence.
          if(earlier&&previous.some(c=>c.id!==card.id&&intersects(c)&&c.y>=card.y+card.h))continue
          if(later&&next.some(c=>c.id!==card.id&&c.y>=target.y+target.h&&c.y<card.y&&intersects(c)))continue
          for(const x of edges){
            if(x<target.x||x+card.w>target.x+target.w)continue
            const bottom=Math.max(blockTop,...previous.filter(c=>c.id!==card.id&&c.x<x+card.w&&c.x+c.w>x).map(c=>c.y+c.h)),missing=target.y-bottom
            if(missing<card.h||missing*m.step<=Math.min(160,card.h*m.step*.25))continue
            const placed={...card,x,y:bottom}
            if(next.some(c=>overlap(placed,c)))continue
            const packed=compact(next.map(c=>c.id===card.id?placed:c)),boundary=packed.find(c=>c.id===target.id)
            if(earlier&&boundary.y>=target.y)continue
            const rank=[later?1:0,later?card.y-target.y:boundary.y-target.y,later?card.x:Math.abs(x-card.x),Math.abs(x-card.x),card.y]
            if(!best||rank.some((v,i)=>v!==best.rank[i]&&rank.slice(0,i).every((p,j)=>p===best.rank[j])&&v<best.rank[i]))best={rank,packed}
          }
        }
      }
      // When no whole card fits, let the following card begin in the shorter
      // column, including a neighbouring column outside its current width.
      // Keeping its content height avoids inflating a short table to match a
      // taller neighbour. Existing column edges still determine its placement.
      if(!best)for(const target of [...next].sort(order)){
        if(target.freePosition||related.has(target.id)||['queued','running','retrying'].includes(byId.get(target.id)?.generationStatus))continue
        const previous=next.filter(c=>c.id!==target.id&&c.y+c.h<=target.y)
        const edges=[...new Set([0,columns,...previous.flatMap(c=>[c.x,c.x+c.w])])].sort((a,b)=>a-b)
        for(let i=0;i<edges.length-1;i++){
          const x=edges[i],w=edges[i+1]-x
          if(w>=target.w||w<minimum(byId.get(target.id),m,true).w)continue
          const above=previous.filter(c=>c.x<x+w&&c.x+c.w>x),bottom=Math.max(0,...above.map(c=>c.y+c.h)),missing=target.y-bottom
          const growth=Math.min(160,...above.filter(c=>c.y+c.h===bottom).map(c=>(c.h*m.step-m.gap)*.25))
          if(!above.length||missing<=0||missing*m.step<=growth)continue
          const placed={...target,x,w,y:bottom}
          // A partly overlapping preceding card is still earlier content. Do
          // not push it down to steal its column while filling another gap.
          if(next.some(c=>c.id!==target.id&&c.y<target.y&&overlap(placed,c)))continue
          const packed=compact(next.map(c=>c.id===target.id?placed:c)),rank=[target.y,-missing,Math.abs(x-target.x)]
          if(!best||rank.some((v,j)=>v!==best.rank[j]&&rank.slice(0,j).every((p,k)=>p===best.rank[k])&&v<best.rank[j]))best={rank,packed}
        }
      }
      if(!best)break
      next=best.packed
    }
    return next
  }
  function place(items,target,id=target.id) {
    const active=bounded({...target,id}), rest=items.filter(n=>n.id!==id).map(bounded)
    // Colliding peers start underneath the pointer's occupied slot. Cascades
    // retain their previous order, including unequal height cards.
    for(const n of rest)if(overlap(n,active))n.y=active.y+active.h
    return compact([...rest,active],active)
  }
  function fillColumnTails(items,nodes,width) {
    let next=compact(items)
    const m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n])),related=new Set()
    for(const n of nodes)if(n.creationMode==='selection'){related.add(n.id);for(const id of n.sourceNodeIds||[])related.add(id)}
    // Existing columns can end at very different heights without a spanning
    // row below them. Move only later cards into a substantially earlier slot;
    // the current top row and ordinary within-column reading order stay put.
    for(const id of [...next].sort(order).map(c=>c.id)){
      const card=next.find(c=>c.id===id),node=byId.get(id)
      if(!card||card.freePosition||related.has(id)||['queued','running','retrying'].includes(node?.generationStatus))continue
      const previous=next.filter(c=>c.id!==id&&c.y<card.y)
      if(!previous.some(c=>c.x<card.x+card.w&&c.x+c.w>card.x&&c.y+c.h<=card.y))continue
      // Preserve subcolumns directly beneath an existing partial-width group.
      if(previous.some(c=>c.w<columns&&c.w>card.w*1.5&&c.x<=card.x&&c.x+c.w>=card.x+card.w&&c.y+c.h===card.y))continue
      const edges=[...new Set([0,columns,...previous.flatMap(c=>[c.x,c.x+c.w])])].sort((a,b)=>a-b)
      let best
      for(let i=0;i<edges.length-1;i++){
        const x=edges[i],w=edges[i+1]-x
        // A wider existing column is still a valid vacancy. Restricting the
        // width ratio strands narrow cards in a tall stack beside empty space.
        // Keep their content height and check the complete target rectangle.
        if(x===card.x||w<card.w||w<minimum(node,m,true).w)continue
        const above=previous.filter(c=>c.x<x+w&&c.x+c.w>x),y=Math.max(0,...above.map(c=>c.y+c.h))
        if(!above.length||(card.y-y)*m.rowStep<=160)continue
        const placed={...card,x,w,y}
        if(next.some(c=>overlap(placed,c)))continue
        if(!best||y<best.y||y===best.y&&Math.abs(x-card.x)<Math.abs(best.x-card.x))best=placed
      }
      if(best)next=compact(next.map(c=>c.id===id?best:c))
    }
    return next
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
  // Use the grabbed header's row for insertion. A tall article's distant
  // centre must not keep the card below the peer under the pointer.
  function moveSlot(items,target,anchorRow=target.y+target.h/2) {
    let peer,distance=Infinity
    for(const c of items)if(overlap(target,c)){const d=Math.abs(anchorRow-c.y-c.h/2);if(d<distance){peer=c;distance=d}}
    return peer?{id:peer.id,after:anchorRow>=peer.y+peer.h/2}:null
  }
  function move(items,target,visibleItems=items,visibleTarget=target,anchorRow=visibleTarget.y+visibleTarget.h/2) {
    const active=bounded(target),original=items.find(c=>c.id===active.id)
    if(original&&['x','y','w','h'].every(k=>original[k]===active[k]))return items.map(bounded)
    const slot=moveSlot(visibleItems,visibleTarget,anchorRow),peer=items.find(c=>c.id===slot?.id)
    // Local minimum-height projection must not move a peer's physical midpoint
    // into its smaller saved frame. Only the ordering decision uses that view.
    if(peer&&!active.freePosition)active.y=slot.after?peer.y+peer.h:peer.y
    const resolved=new Map(compact(place(items,active)).map(c=>[c.id,c]))
    return items.map(c=>resolved.get(c.id))
  }
  // Standard preserves the current reading rows. Grow shorter peers to their
  // row's content height instead of pulling or narrowing a later row into it.
  function arrangeOnce(nodes,items,width) {
    const m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n])),ordered=items.map(bounded).filter(c=>byId.has(c.id)).sort(order)
    // Current row intent takes precedence over a template's creation-time
    // recommended width. Wide tables retain their own horizontal scrolling.
    const rowMinimum=node=>{
      if(!node?.containerSpec&&['generated-container','planning-card'].includes(node?.kind))return minimum({...node,workbenchSpan:false},m,true)
      return minimum(node,m)
    }
    const rows=[]
    for(const cell of ordered){
      let row=rows.at(-1)
      if(!row||row.top!==cell.y){row={top:cell.y,cells:[]};rows.push(row)}
      row.cells.push(cell)
    }
    const result=new Map();let top=0
    const placeRow=cells=>{
      const minima=cells.map(c=>rowMinimum(byId.get(c.id)).w)
      // Only an actual reading minimum can split an existing row. Never borrow
      // a following row's card to fill a slot or shrink a full-row component.
      if(minima.reduce((sum,w)=>sum+w,0)>columns){
        let part=[],used=0
        cells.forEach((c,i)=>{if(part.length&&used+minima[i]>columns){placeRow(part);part=[];used=0}part.push(c);used+=minima[i]})
        if(part.length)placeRow(part)
        return
      }
      const widths=Array(cells.length),open=new Set(cells.map((_,i)=>i));let remaining=columns
      while(open.size){
        const weight=[...open].reduce((sum,i)=>sum+cells[i].w,0),limited=[...open].filter(i=>remaining*cells[i].w/weight<minima[i])
        if(!limited.length){for(const i of open)widths[i]=remaining*cells[i].w/weight;break}
        for(const i of limited){widths[i]=minima[i];remaining-=minima[i];open.delete(i)}
      }
      const spans=widths.map(Math.floor),fractions=widths.map((w,i)=>({i,remainder:w-spans[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i)
      for(let spare=columns-spans.reduce((sum,w)=>sum+w,0),i=0;spare>0;spare--,i++)spans[fractions[i].i]++
      const height=Math.max(...cells.map(c=>{const node=byId.get(c.id),preferred=node.preferred||node;return clamp(Math.max(rowMinimum(node).h,Math.ceil(((preferred.height||260)+m.gap)/m.rowStep)),3,300)}))
      let left=0
      cells.forEach((c,i)=>{result.set(c.id,{...c,x:left,y:top,w:spans[i],h:height});left+=spans[i]})
      top+=height
    }
    for(const row of rows)placeRow(row.cells)
    return items.map(c=>result.get(c.id)||bounded(c))
  }
  // Only the explicitly authored native Board example owns these row groups.
  // Normal Standard Arrange continues to preserve the user's existing rows.
  // Both the first Arrange commit and its deferred content fit use this plan.
  function authoredBoardPlan(nodes,items,width) {
    const names=['indices','watchlist','quote','news','announcements','calendar','smart']
    const group=nodes[0]?.workbenchId
    if(!nodes.length||typeof group!=='string'||!group.startsWith('home-guide:')||nodes.some(n=>n.workbenchId!==group||n.workbenchLayoutVersion!==1||n.preserveGenerationSize!==true||n.sizeMode!=='manual'||!Number.isInteger(n.workbenchIndex)||n.workbenchIndex<0||n.workbenchIndex>6))return
    const byName=new Map()
    for(const node of nodes){
      const name=names[node.workbenchIndex],spec=node.containerSpec
      if(byName.has(name)||name==='calendar'&&spec?.type!=='calendar-tool'||!['calendar','smart'].includes(name)&&(spec?.type!=='financial-widget'||spec.widget!==name)||name==='smart'&&spec&&spec.type!=='table')return
      byName.set(name,node)
    }
    if(items.length!==nodes.length||items.some(c=>!nodes.some(n=>n.id===c.id)))return
    const m=metrics(width),pair=m.minColumns<=20,calendarPair=pair&&m.width>=800&&byName.has('smart')
    const rows=[['indices'],...(pair?[['watchlist','quote'],['news','announcements']]:[['watchlist'],['quote'],['news'],['announcements']]),...(calendarPair?[['calendar','smart']]:[['calendar'],['smart']])]
    const heights={indices:m.width-48<=520?420:340,watchlist:600,quote:600,news:340,announcements:340,calendar:420,smart:420}
    const planned=new Map();let top=0
    for(const row of rows){
      const members=row.filter(name=>byName.has(name));if(!members.length)continue
      const height=Math.max(...members.map(name=>Math.ceil((heights[name]+m.gap)/m.rowStep)))
      const split=row[0]==='watchlist'&&pair&&m.minColumns<=16
      for(const name of members){const index=row.indexOf(name),node=byName.get(name),{arrangeColumns,...cell}=items.find(c=>c.id===node.id);planned.set(node.id,{...cell,x:split?(index?16:0):index*(40/row.length),y:top,w:split?(index?24:16):40/row.length,h:height})}
      top+=height
    }
    return items.map(c=>bounded(planned.get(c.id)||c))
  }
  function arrange(nodes,items,width,visibleHeight=0,mode='standard',options={}) {
    const authored=options.authoredBoard===true&&mode==='standard'&&authoredBoardPlan(nodes,items,width)
    if(authored)return authored
    const requested={three:3,two:2,one:1}[mode]
    // Explicit column modes retain their independent shortest-column packing.
    // Standard keeps existing row membership, including unequal peer widths.
    if(requested){
      const m=metrics(width),byId=new Map(nodes.map(n=>[n.id,n])),ordered=items.map(bounded).filter(c=>byId.has(c.id)).sort(order)
      // A chosen column count is explicit, including narrow viewports. Keep
      // text at its own size and let each component wrap or scroll its content.
      const lanes=Math.max(1,Math.min(requested,ordered.length))
      const edges=Array.from({length:lanes+1},(_,i)=>Math.round(i*columns/lanes)),result=new Map(),tails=Array(lanes).fill(0)
      for(const c of ordered){
        const lane=tails.indexOf(Math.min(...tails)),node=byId.get(c.id),preferred=node.preferred||node
        const h=clamp(Math.max(minimum(node,m).h,Math.ceil(((preferred.height||260)+m.gap)/m.rowStep)),3,300)
        result.set(c.id,{...c,x:edges[lane],w:edges[lane+1]-edges[lane],y:tails[lane],h,arrangeColumns:requested})
        tails[lane]+=h
      }
      return items.map(c=>result.get(c.id)||bounded(c))
    }
    let next=items.map(({arrangeColumns,...c})=>bounded(c))
    // A width minimum may split a row. Settle that boundary once, then keep it
    // stable when later native or HTML measurements supply natural heights.
    for(let pass=0;pass<items.length*4+4;pass++){
      const fitted=arrangeOnce(nodes,next,width)
      if(fitted.every((c,i)=>['x','y','w','h'].every(k=>c[k]===next[i][k])))return fitted
      next=fitted
    }
    return next
  }
  function append(items,id,w=20,h=7,minWidth=w){
    const frame=bounded({id,x:0,y:0,w,h}),existing=items.map(bounded)
    w=frame.w;h=frame.h;minWidth=clamp(Math.round(minWidth)||w,4,w)
    // Scan complete horizontal slots from the top. The full new height must be
    // clear, so a lower card cannot be covered while filling an earlier row.
    const rows=[...new Set([0,...existing.flatMap(c=>[c.y,c.y+c.h])])].sort((a,b)=>a-b)
    for(const y of rows){
      const occupied=existing.filter(c=>c.y<y+h&&c.y+c.h>y).sort((a,b)=>a.x-b.x),gaps=[]
      let edge=0
      for(const cell of occupied){if(cell.x>edge)gaps.push({x:edge,w:cell.x-edge});edge=Math.max(edge,cell.x+cell.w)}
      if(edge<columns)gaps.push({x:edge,w:columns-edge})
      const gap=gaps.find(g=>g.w>=w)??gaps.find(g=>g.w>=minWidth)
      if(gap)return bounded({id,x:gap.x,y,w:Math.min(w,gap.w),h})
    }
    return bounded({id,x:0,y:Math.max(0,...existing.map(c=>c.y+c.h)),w,h})
  }
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
  return {columns,gap,inset,metrics,minimum,bounded,overlap,compact,fillVacancies,closeSmallGaps,place,resize,resizeSelection,moveSlot,move,authoredBoardPlan,arrange,append,draw,migrate,project}
}
