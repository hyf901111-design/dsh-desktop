export function patchFigmaFinalCanvas(source: string): string
export const canvasCss: string

export function researchCanvasDotMetrics(canvasSize: { width: number; height: number }, viewport: { x: number; y: number; scale: number }): { scale: number; columns: number; rows: number; x: number; y: number }
export function researchCanvasDotRowPath(columns: number): string
