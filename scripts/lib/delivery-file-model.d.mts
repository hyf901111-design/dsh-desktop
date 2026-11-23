export function normaliseDeliveryPath(value: string, cwd?: string): string | undefined
export function deliveryPathsFromMarkdown(text: string, cwd?: string): string[]
export function deliveryPathsFromFinalInlineCode(text: string, cwd?: string): string[]
export function deliveryPathsFromFinalText(text: string, cwd?: string): string[]
export function mergeDeliveryPaths(produced: string[], text: string, cwd?: string): string[]
export function verifiedResearchDeliveryPaths(message: unknown): string[]
export function homeGuideDeliveryPaths(message: unknown, toolName?: string): string[]
export function presentationDelivery(message: unknown, toolName?: string, turn?: number): { turnId: string; paths: string[]; complete?: true } | undefined
export function presentationCodeDelivery(event: unknown): { turnId: string; paths: string[]; complete?: true } | undefined
export const deliveryModelSource: string
