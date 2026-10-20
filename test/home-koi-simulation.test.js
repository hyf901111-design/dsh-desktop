import {expect,it} from 'vitest'
import {Simulation} from '../src/preload/home-koi/simulation.js'

it.each([[1150,720],[920,600],[760,860]])('keeps two swimming bodies apart without abrupt turns at %sx%s', (width,height)=>{
  for(const seed of [1,7,42,20261021]) {
    const pond=new Simulation({width,height,seed})
    let close=0,samples=0,travel=0
    for(let frame=0;frame<60*180;frame++) {
      const before=pond.fish.map(f=>({x:f.x,y:f.y,velocity:f.velocity,turn:f.turn}))
      pond.step(1/60)
      pond.fish.forEach((fish,i)=>{
        expect(Math.abs(fish.velocity-before[i].velocity)*60).toBeLessThanOrEqual(65.001)
        expect(Math.abs(fish.turn-before[i].turn)*60).toBeLessThanOrEqual(.601)
        expect(Number.isFinite(fish.x+fish.y+fish.phase)).toBe(true)
        travel+=Math.hypot(fish.x-before[i].x,fish.y-before[i].y)
      })
      if(frame%12)continue
      const [a,b]=pond.fish;let distance=Infinity
      for(let i=3;i<=21;i+=2)for(let j=3;j<=21;j+=2)distance=Math.min(distance,Math.hypot(a.spine[i*4]-b.spine[j*4],a.spine[i*4+1]-b.spine[j*4+1]))
      if(distance<48)close++
      samples++
    }
    expect(close/samples,`seed ${seed}: ${close} close samples`).toBeLessThan(.035)
    expect(travel).toBeGreaterThan(5000)
  }
},20000)
