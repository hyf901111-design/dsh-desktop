export class Simulation {
  constructor(options?: { width?: number; height?: number; seed?: number; fishCount?: number })
  resize(width: number, height: number): void
  step(delta: number, speed?: number): void
}
