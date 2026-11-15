export type CanvasHumanRequest = { messageId?: string; text: string }
type CanvasSession = {
  events?: ReadonlyArray<{
    type: string
    data?: {
      id?: string
      source?: { kind?: string }
      content?: ReadonlyArray<{ type: string; text?: string }>
    }
  }>
}

export function canvasHumanText(text: string): string | null
export function canvasHumanRequest(session?: CanvasSession): CanvasHumanRequest | null
export function ongoingCanvasRequest(session?: CanvasSession): CanvasHumanRequest | null
export function scheduledTaskRequest(session?: CanvasSession): CanvasHumanRequest | null
