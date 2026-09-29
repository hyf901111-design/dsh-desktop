export function serializeWorkbenchContent(root: Element, width: number, height: number): string
export function installWorkbenchExport(serialize: typeof serializeWorkbenchContent): void
export function isPassiveWorkbenchSvg(value: unknown, parse: (value: string) => unknown): boolean
