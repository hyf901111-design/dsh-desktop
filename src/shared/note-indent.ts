export const NOTE_INDENT_STEP = 32
export function noteIndentLevel(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(8, Math.trunc(value))) : 0
}
