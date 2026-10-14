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
