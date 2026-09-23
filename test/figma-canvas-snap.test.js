import {describe,it,expect} from 'vitest'
import {figmaCanvasBounds,figmaCanvasSnap,patchFigmaCanvasGestures} from '../scripts/lib/figma-canvas-gestures.mjs'
import {readFileSync} from 'node:fs'
const rect=(x,y,w=100,h=100)=>figmaCanvasBounds([{x,y,width:w,height:h}])
describe('Figma 59 screen-space snapping',()=>{
  it.each([.25,1,2])('snaps only within 4px and releases by 6px at zoom %s',scale=>{
    const targets=[{id:'a',bounds:rect(100,100)}]
    const first=figmaCanvasSnap(rect(100+3/scale,175),targets,scale)
    expect(first.x*scale).toBeCloseTo(-3)
    expect(figmaCanvasSnap(rect(100+5/scale,175),targets,scale,first.targets).x*scale).toBeCloseTo(-5)
    expect(figmaCanvasSnap(rect(100+7/scale,175),targets,scale,first.targets).targets.x).not.toBe(first.targets.x)
  })
  it('uses only nearby component alignment, not gap or distant candidates, and clears with Alt',()=>{
    const targets=[{id:'edge',bounds:rect(104,100)},{id:'gap',bounds:rect(-16,220)},{id:'far',bounds:rect(100,2000)}]
    const snap=figmaCanvasSnap(rect(100,220),targets,1)
    expect(snap.x).toBe(4)
    expect(snap.targets.x).toContain('edge:')
    expect(snap.guides.filter(g=>g.axis==='x')).toHaveLength(1)
    expect(figmaCanvasSnap(rect(100,220),targets,1,snap.targets,null,true)).toMatchObject({x:0,y:0,guides:[],targets:{}})
    expect(figmaCanvasSnap(rect(100,220),[targets[1]],1).targets.x).toBeUndefined()
    expect(figmaCanvasSnap(rect(100,220),[targets[2]],1).guides).toEqual([])
    expect(figmaCanvasSnap(rect(100,220),[{id:'aligned-but-distant',bounds:rect(100,40)}],1).guides).toEqual([])
  })
  it('has no directional grid and accepts only the moving corner when resizing',()=>{
    const targets=[{id:'a',bounds:rect(250,220)}]
    expect(figmaCanvasSnap(rect(150,100),targets,1,{},'nw').targets.x).toBeUndefined()
    expect(figmaCanvasSnap(rect(150,100),targets,1,{},'se').targets.x).toBeDefined()
    expect(figmaCanvasSnap(rect(177,311),[],1).guides).toEqual([])
  })
  it('is idempotent on the shipped client',()=>{
    const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
    const patched=patchFigmaCanvasGestures(source)
    expect(patchFigmaCanvasGestures(patched)).toBe(patched)
  })
})
