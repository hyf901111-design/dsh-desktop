export const SPINE_POINTS = 25;
export const FISH_LENGTH = 310;

export function initializeSpine(fish,length) {
  fish.trail=new Float64Array(SPINE_POINTS*2);
  fish.spine=new Float32Array(SPINE_POINTS*4);
  for(let i=0;i<SPINE_POINTS;i++) {
    const distance=length*i/(SPINE_POINTS-1);
    fish.trail[i*2]=fish.x-Math.cos(fish.angle)*distance;
    fish.trail[i*2+1]=fish.y-Math.sin(fish.angle)*distance;
  }
  updateSpine(fish,length);
}

/** The body follows the nose's path, rather than rotating about the nose. */
export function updateSpine(fish,length) {
  const trail=fish.trail,pose=fish.spine,link=length/(SPINE_POINTS-1);
  trail[0]=fish.x;trail[1]=fish.y;
  for(let i=1;i<SPINE_POINTS;i++) {
    const prev=(i-1)*2,current=i*2;
    const dx=trail[prev]-trail[current],dy=trail[prev+1]-trail[current+1];
    const distance=Math.hypot(dx,dy);
    const nx=distance>1e-9?dx/distance:Math.cos(fish.angle);
    const ny=distance>1e-9?dy/distance:Math.sin(fish.angle);
    trail[current]=trail[prev]-nx*link;
    trail[current+1]=trail[prev+1]-ny*link;
  }
  for(let i=0;i<SPINE_POINTS;i++) {
    const previous=Math.max(0,i-1)*2,next=Math.min(i+1,SPINE_POINTS-1)*2;
    const dx=trail[previous]-trail[next],dy=trail[previous+1]-trail[next+1];
    const norm=Math.hypot(dx,dy)||1,along=i/(SPINE_POINTS-1);
    // The cranium and trunk stay on the traveled path. A small traveling wave
    // grows toward the tail, so a stroke bends the rear instead of dragging
    // the fish's visible mass sideways through the water during every turn.
    const envelope=Math.pow(Math.max(0,(along-0.18)/0.82),2.2);
    const stroke=Math.sin(fish.phase-along*Math.PI*1.8)*envelope*length*0.06*(0.35+0.65*fish.effort);
    pose[i*4]=trail[i*2]-dy/norm*stroke;
    pose[i*4+1]=trail[i*2+1]+dx/norm*stroke;
  }
  for(let i=0;i<SPINE_POINTS;i++) {
    const previous=Math.max(0,i-1)*4,next=Math.min(i+1,SPINE_POINTS-1)*4;
    const dx=pose[previous]-pose[next],dy=pose[previous+1]-pose[next+1];
    const norm=Math.hypot(dx,dy)||1;
    pose[i*4+2]=-dy/norm;
    pose[i*4+3]=dx/norm;
  }
}
