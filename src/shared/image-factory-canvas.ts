export const canvasFonts = [
  { family: 'system-ui', label: '系统默认', english: 'System' },
  { family: 'PingFang SC', label: '苹方', english: 'PingFang SC' },
  { family: 'Songti SC', label: '宋体', english: 'Songti SC' },
  { family: 'Arial', label: 'Arial', english: 'Arial' },
  { family: 'Georgia', label: 'Georgia', english: 'Georgia' },
  { family: 'Menlo', label: 'Menlo', english: 'Menlo' },
] as const

export const canvasImageTypes = ['image/png', 'image/jpeg', 'image/webp'] as const
export type CanvasImageType = typeof canvasImageTypes[number]
export const maximumCanvasLayers = 100
export const maximumCanvasImageBytes = 36 * 1024 * 1024
export const canvasUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u

export type CanvasScope = string | null
export type ImageFactoryTaskTab = { scope: CanvasScope; title?: string }
export type TextLayer = {
  id: string; kind: 'text'; text: string; x: number; y: number; width: number
  fontSize: number; family: typeof canvasFonts[number]['family']; weight: number
  align: 'left' | 'center' | 'right'; color: string
}
export type StoredImageLayer = { id: string; kind: 'image'; assetId: string; mediaType: CanvasImageType }
export type StoredCanvas = {
  version: 1; id: string; title: string; width: number; height: number; layers: (StoredImageLayer | TextLayer)[]
}
export type CanvasImage = { data: Uint8Array; mediaType: CanvasImageType }
export type CanvasRead = { epoch: number; canvas?: StoredCanvas; image?: CanvasImage }
export type CanvasWrite = { epoch: number; scope: CanvasScope; canvas: StoredCanvas; image?: Uint8Array }
export interface CanvasStorage {
  read(scope: CanvasScope): Promise<CanvasRead>
  write(value: CanvasWrite): Promise<void>
  adopt(sessionId: string, epoch: number): Promise<boolean>
}

export function validCanvasSize(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= 4096 && height <= 4096 && width * height <= 8_000_000
}

export function validCanvasScope(value: unknown): value is CanvasScope {
  return value === null || typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/u.test(value)
}
