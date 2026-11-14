export function serializeWorkbenchContent(root: Element, width: number, height: number, includeBackground?: boolean): string
export function workbenchImageExportRequest(doc: Document, svg: string, title: string, format: 'svg' | 'png' | 'jpg'): Promise<
  { kind: 'text'; format: 'svg'; suggestedName: string; content: string } |
  { kind: 'binary'; format: 'png' | 'jpg'; suggestedName: string; base64: string }
>
export function installWorkbenchExport(serialize: typeof serializeWorkbenchContent): void
export function isPassiveWorkbenchSvg(value: unknown, parse: (value: string) => unknown): boolean
