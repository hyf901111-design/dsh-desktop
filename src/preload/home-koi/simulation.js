import { FISH_LENGTH, initializeSpine, updateSpine } from './spine.js';
const TAU = Math.PI * 2;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All coordinates are CSS pixels. A stable seed makes visual QA repeatable. */
export class Simulation {
  constructor({ width = 1150, height = 720, seed = Date.now(), fishCount = 2 } = {}) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.random = seededRandom(seed);
    this.time = 0;
    this.fish = [];
    this.ripples = [];
    this.pointer = null;
    this.nextRipple = 1.8;
    this.setFishCount(fishCount);
    this.addRipple(width * 0.70, height * 0.52, 1, -1.8);
    this.addRipple(width * 0.64, height * 0.37, 0.75, -0.6);
  }

  range(a, b) { return a + (b - a) * this.random(); }

  setFishCount(count) {
    count = clamp(Math.round(Number(count) || 0), 0, 6);
    this.fish.length = Math.min(this.fish.length, count);
    while (this.fish.length < count) {
      const i = this.fish.length;
      const x = (i === 0 ? 0.48 : i === 1 ? 0.64 : this.range(0.2, 0.8)) * this.width;
      const y = (i === 0 ? 0.27 : i === 1 ? 0.75 : this.range(0.2, 0.8)) * this.height;
      const fish={
        x, y, angle: i === 0 ? -0.12 : -Math.PI + 0.12, turn: 0,
        lane: i % 2 === 0 ? 0.26 : 0.77,
        phase: this.range(0, TAU), rhythm: this.range(0.87, 1.12),
        wander: this.range(0, TAU), cycle: this.range(0, TAU),
        cyclePeriod: this.range(5.5,8.5), effort: 0.5, velocity: 66,
        size: i === 0 ? 1 : this.range(0.87, 0.97),
        tx: this.range(0.15, 0.85) * this.width,
        ty: this.range(0.12, 0.88) * this.height,
        retarget: this.range(4, 8),
      };
      fish.velocity*=fish.rhythm;
      this.chooseTarget(fish);
      initializeSpine(fish,FISH_LENGTH*fish.size);
      this.fish.push(fish);
    }
  }

  get scale() { return Math.min(this.width/1150,this.height/720); }

  chooseTarget(fish) {
    const angle=fish.angle+this.range(-1.3,1.3);
    const distance=this.range(300,620)*this.scale;
    // Keep destinations in open water. Repeated forward targets on the edge
    // would trap a smooth-turning fish in a perimeter orbit.
    fish.tx=clamp(fish.x+Math.cos(angle)*distance,this.width*0.25,this.width*0.75);
    fish.ty=clamp(fish.y+Math.sin(angle)*distance,this.height*(fish.lane-0.10),this.height*(fish.lane+0.10));
    fish.retarget=this.range(8,13);
  }

  resize(width, height) {
    width = Math.max(1, width); height = Math.max(1, height);
    const sx = width / this.width, sy = height / this.height;
    for (const fish of this.fish) {
      const dx=fish.x*(sx-1),dy=fish.y*(sy-1);
      fish.x *= sx; fish.y *= sy; fish.tx *= sx; fish.ty *= sy;
      // Reposition in the larger pond without resizing or reposing the fish.
      for(let i=0;i<fish.trail.length;i+=2) { fish.trail[i]+=dx;fish.trail[i+1]+=dy; }
      for(let i=0;i<fish.spine.length;i+=4) { fish.spine[i]+=dx;fish.spine[i+1]+=dy; }
    }
    for (const ripple of this.ripples) { ripple.x *= sx; ripple.y *= sy; }
    this.width = width; this.height = height;
  }

  addRipple(x, y, strength = 1, time = this.time) {
    if (!Number.isFinite(x + y + strength)) return;
    this.ripples.push({ x, y, strength: clamp(strength, 0, 1.5), time });
    if (this.ripples.length > 12) this.ripples.shift();
  }

  step(delta, speed = 1) {
    let remaining = clamp(Number(delta) || 0, 0, 0.1);
    while (remaining > 1e-9) {
      const dt = Math.min(1 / 60, remaining);
      this.advance(dt, speed);
      remaining -= dt;
    }
  }

  advance(dt, speed) {
    this.time += dt;
    this.ripples = this.ripples.filter(r => this.time - r.time < 6.5);
    this.nextRipple -= dt;
    if (this.nextRipple <= 0) {
      this.addRipple(this.range(0.38, 0.90) * this.width, this.range(0.22, 0.78) * this.height, this.range(0.65, 1));
      this.nextRipple = this.range(1.1, 2.5);
    }
    const scale = this.scale, motionDt=dt*speed;
    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      fish.retarget -= motionDt;
      if (fish.retarget <= 0 || Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 80 * scale) this.chooseTarget(fish);
      let dx = fish.tx - fish.x, dy = fish.ty - fish.y;
      const goalDistance=Math.hypot(dx,dy)||1;
      dx/=goalDistance;dy/=goalDistance;
      const aheadX=fish.x+Math.cos(fish.angle)*180*scale;
      const aheadY=fish.y+Math.sin(fish.angle)*180*scale;
      const margin=Math.max(16,130*scale);
      dx+=1.8*(Math.pow(Math.max(0,(margin-aheadX)/margin),2)-Math.pow(Math.max(0,(aheadX-this.width+margin)/margin),2));
      dy+=1.8*(Math.pow(Math.max(0,(margin-aheadY)/margin),2)-Math.pow(Math.max(0,(aheadY-this.height+margin)/margin),2));
      // Broad, overlapping home ranges let each fish wander without repeatedly
      // steering both toward the middle of the pond.
      dy+=clamp((fish.lane*this.height-fish.y)/(this.height*0.18),-1.7,1.7);
      let encounter=0;
      for(const other of this.fish) {
        if(other===fish) continue;
        // Look ahead against the whole other body, not just its head. A smooth
        // steering force starts before the turn radius makes avoidance too late.
        const lead=fish.velocity*scale*1.8;
        const fx=fish.x+Math.cos(fish.angle)*lead,fy=fish.y+Math.sin(fish.angle)*lead;
        let nearest=Infinity,px=0,py=0;
        for(let k=2;k<=22;k+=4) {
          const bx=fx-other.spine[k*4],by=fy-other.spine[k*4+1],distance=Math.hypot(bx,by);
          if(distance<nearest) { nearest=distance;px=bx;py=by; }
        }
        const repel=Math.max(0,1-nearest/(230*scale));
        encounter=Math.max(encounter,repel);
        if(nearest>0.001) { dx+=px/nearest*repel*2.4;dy+=py/nearest*repel*2.4; }
      }
      if (this.pointer) {
        const px = fish.x - this.pointer.x, py = fish.y - this.pointer.y;
        const distance = Math.hypot(px, py);
        const repel = Math.max(0, 1 - distance / (160 * scale));
        if(distance>0.001) { dx+=px/distance*repel*1.2;dy+=py/distance*repel*1.2; }
      }
      const exploration=Math.sin(this.time*0.23+fish.wander)*0.10
        +Math.sin(this.time*0.47+fish.wander*1.7)*0.045;
      const wanted=Math.atan2(dy,dx)+exploration;
      let headingError=angleDelta(fish.angle,wanted);
      // A target almost directly behind has two equivalent turn directions.
      // Keep the current arc instead of reversing yaw when that angle crosses π.
      if(Math.abs(headingError)>2.2&&Math.abs(fish.turn)>0.12) headingError=Math.sign(fish.turn)*Math.abs(headingError);
      const wantedTurn=clamp(headingError*0.70,-0.56,0.56);
      fish.turn+=clamp((wantedTurn-fish.turn)*(1-Math.exp(-motionDt/0.45)),-0.6*motionDt,0.6*motionDt);
      fish.angle+=fish.turn*motionDt;
      fish.cycle+=motionDt*TAU/fish.cyclePeriod;
      if(fish.cycle>=TAU) { fish.cycle%=TAU;fish.cyclePeriod=this.range(5.5,8.5); }
      fish.effort=Math.pow(0.5+0.5*Math.sin(fish.cycle),3.0);
      // Ease off propulsion near an edge so the head can complete a smaller arc.
      // The same velocity damping preserves a continuous glide into and out of it.
      const clearance=Math.min(fish.x,this.width-fish.x,fish.y,this.height-fish.y);
      const edgePace=clamp(clearance/(160*scale),0.35,1);
      const turnPace=1-Math.min(0.35,Math.abs(fish.turn)*0.55);
      const targetVelocity=(52+48*fish.effort)*fish.rhythm*edgePace*turnPace*(1-encounter*0.35);
      const response=targetVelocity>fish.velocity?0.85:1.2;
      const change=(targetVelocity-fish.velocity)*(1-Math.exp(-motionDt/response));
      fish.velocity+=clamp(change,-65*motionDt,65*motionDt);
      const velocity = fish.velocity * scale * speed;
      fish.x += Math.cos(fish.angle) * velocity * dt;
      fish.y += Math.sin(fish.angle) * velocity * dt;
      fish.phase=(fish.phase+motionDt*TAU*(0.40+0.75*fish.effort)*fish.rhythm)%TAU;
      updateSpine(fish,FISH_LENGTH*fish.size,motionDt);
    }
  }
}
