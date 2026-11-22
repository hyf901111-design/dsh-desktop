export function openHomePresentationReference(doc: Document, fileId: string, controls: {
  waitFor(read: () => boolean, message: string): Promise<void>
  cue(node: HTMLElement, label: string): Promise<void>
}): Promise<{ file: HTMLElement; row(): HTMLElement | undefined; restorePanel(): Promise<void> }>
