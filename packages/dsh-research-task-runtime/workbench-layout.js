// Top-left geometry shared by planning and the serialized canvas. Explicit wide
// content establishes a full-width reading row; other cards fill the two lanes.
export function workbenchLayoutFrames(input,left=0,top=0,gap=16){
 const cards=input.map(n=>n.workbenchSpan&&n.workbenchLayoutVersion!==1?{...n,workbenchSpan:false}:n);
 const wide=cards.some(n=>n.workbenchSpan===true);
 const leftWidth=Math.max(0,...cards.filter((n,i)=>!n.workbenchSpan&&i%2===0).map(n=>n.width));
 if(!wide){let y=top;return cards.map((n,i)=>{if(i&&i%2===0)y+=Math.max(cards[i-2].height,cards[i-1].height)+gap;return {...n,x:left+(i%2?leftWidth+gap:0),y}})}
 const lane=Math.max(320,...cards.filter(n=>!n.workbenchSpan).map(n=>n.width)),width=Math.max(980,lane*2+gap,...cards.filter(n=>n.workbenchSpan).map(n=>n.width));
 const tails=[top,top];
 return cards.map(n=>{
  if(n.workbenchSpan){const y=Math.max(...tails);tails.fill(y+n.height+gap);return {...n,width,x:left,y}}
  const laneIndex=tails[0]<=tails[1]?0:1,y=tails[laneIndex];tails[laneIndex]+=n.height+gap;
  return {...n,x:left+laneIndex*(width+gap)/2,y};
 });
}
