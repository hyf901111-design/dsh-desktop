import type { Simulation } from './simulation.js'

export type PondOptions = { darkness: number; brightness: number; rippleStrength: number; softness: number }
export class PondRenderer {
  constructor(canvas: HTMLCanvasElement, water: HTMLImageElement, koi: HTMLImageElement)
  readonly gl: WebGLRenderingContext
  resize(width: number, height: number, dpr?: number): void
  draw(simulation: Simulation, options: PondOptions): void
  destroy(): void
}
