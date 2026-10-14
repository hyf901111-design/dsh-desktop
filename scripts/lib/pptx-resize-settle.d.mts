export interface PptxResizeViewer {
  sherlockResizeTimer?: ReturnType<typeof setTimeout>
  presentation?: unknown
  activeRenderMode?: string
  container: HTMLElement
  getDisplayMetrics(): { scale: number; displayWidth: number; displayHeight: number }
  queueRender(): unknown
}
export function cancelPptxResize(viewer: PptxResizeViewer): void
export function schedulePptxResize(viewer: PptxResizeViewer): void
export function configurePptxCategoryAxis(axis: {
  type?: string
  data?: unknown[]
  axisLabel?: { interval?: number | string | ((index: number) => boolean); [key: string]: unknown }
}, source: {
  sherlockTickLabelSkip?: number
  sherlockAuto?: boolean
  sherlockDateAxis?: boolean
  sherlockDateStep?: number
  sherlockDateUnit?: string
  deleted?: boolean
  tickLblPos?: string
  min?: number
}): void
export function stripPptxResizePatch(source: string): string
export function patchPptxResize(source: string): string
export function createPptxScrollWindow(
  viewer: {
    viewerOptions: { scrollContainer?: HTMLElement | null }
    listOptions: { overscanViewport: number }
    mountedSlides: Set<number>
    isRenderStale(version: number): boolean
  },
  wrappers: HTMLElement[],
  mount: (index: number) => void,
  unmount: (index: number) => void,
  version: number
): { observe(wrapper: HTMLElement): void; disconnect(): void }

export function createPptxXmlLookupCache(): <T>(element: object | null, kind: 'attribute' | 'child', name: string, load: () => T) => T

export function observePptxChartResize<T extends { isDisposed(): boolean; dispose(): void; getWidth(): number; getHeight(): number; resize(): void }>(chart: T, element: HTMLElement, instances?: Set<T>): ResizeObserver
