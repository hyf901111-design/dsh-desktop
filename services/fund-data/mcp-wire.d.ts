export function boundedText(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<string>
export function readRpc(response: Response, id: string | number, signal: AbortSignal): Promise<{
  jsonrpc: '2.0'
  id: string | number
  result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ type: string; text?: string }> }
  error?: unknown
}>
