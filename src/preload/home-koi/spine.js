export const SPINE_POINTS = 25;
export const FISH_LENGTH = 310;
const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const smoothstep = (a,b,x) => {
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
};

export function initializeSpine(fish,length) {
  fish.trail=new Float64Array(SPINE_POINTS*2);
  fish.spine=new Float32Array(SPINE_POINTS*4);
  fish.spineAngles=new Float64Array(SPINE_POINTS-1).fill(fish.angle);
  for(let i=0;i<SPINE_POINTS;i++) {
    const distance=length*i/(SPINE_POINTS-1);
    fish.trail[i*2]=fish.x-Math.cos(fish.angle)*distance;
    fish.trail[i*2+1]=fish.y-Math.sin(fish.angle)*distance;
  }
  updateSpine(fish,length);
}

/** Equal-length links trail the head; propulsion travels back along that path. */
export function updateSpine(fish,length,dt=0) {
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
  pose[0]=fish.x;pose[1]=fish.y;
  let previousAngle=fish.angle,previousPathAngle=fish.angle;
  for(let i=1;i<SPINE_POINTS;i++) {
    const along=(i-0.5)/(SPINE_POINTS-1);
    const t=i*2,previous=(i-1)*2;
    const rawPathAngle=Math.atan2(trail[previous+1]-trail[t+1],trail[previous]-trail[t]);
    // Unwrap along the chain. Independent head-relative angles would flip the
    // rear half between +π and -π while the head barely moves in a tight turn.
    const pathAngle=previousPathAngle+angleDelta(previousPathAngle,rawPathAngle);
    previousPathAngle=pathAngle;
    // Keep the cranium quiet. The body inherits the older path progressively.
    let angle=fish.angle+(pathAngle-fish.angle)*smoothstep(0.14,0.43,along);
    const envelope=Math.pow(Math.max(0,(along-0.18)/0.82),1.45);
    angle+=Math.sin(fish.phase-along*Math.PI*1.8)*envelope*0.37*(0.35+0.65*fish.effort);
    // Tight turns can fold the historical path back across itself. Limit local
    // curvature so the rendered body stays a flowing arc rather than a kink.
    const maxBend=0.07+envelope*0.025;
    let minAngle=previousAngle-maxBend,maxAngle=previousAngle+maxBend;
    if(dt>0) {
      // Historical links can change quickly when a tight old arc unwinds.
      // Damped, bounded joint rotation keeps that change continuous in time.
      const oldAngle=fish.spineAngles[i-1];
      angle=oldAngle+angleDelta(oldAngle,angle)*(1-Math.exp(-dt/0.10));
      minAngle=Math.max(minAngle,oldAngle-1.6*dt);
      maxAngle=Math.min(maxAngle,oldAngle+1.6*dt);
    }
    angle=Math.max(minAngle,Math.min(maxAngle,angle));
    pose[i*4]=pose[(i-1)*4]-Math.cos(angle)*link;
    pose[i*4+1]=pose[(i-1)*4+1]-Math.sin(angle)*link;
    previousAngle=angle;
    fish.spineAngles[i-1]=angle;
  }
  for(let i=0;i<SPINE_POINTS;i++) {
    let dx,dy;
    if(i===0) { dx=Math.cos(fish.angle);dy=Math.sin(fish.angle); }
    else {
      const a=(i-1)*4,b=Math.min(i+1,SPINE_POINTS-1)*4;
      dx=pose[a]-pose[b];dy=pose[a+1]-pose[b+1];
    }
    const norm=Math.hypot(dx,dy)||1;
    pose[i*4+2]=-dy/norm;
    pose[i*4+3]=dx/norm;
  }
}
