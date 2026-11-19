export function researchFrameWheelMessage(event: WheelEvent, interactive: boolean): ({
  x: number
  y: number
  deltaX: number
  deltaY: number
} & ({ type: 'sherlock-content-pan' } | { type: 'sherlock-content-zoom'; ctrlKey: boolean })) | null
export const boardFileWheelScript: string
export const boardFileWheelSuffix: string
