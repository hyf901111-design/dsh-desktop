import type { JsonSchema } from '../../shared/integrations'

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** MCP query parameters travel in a URL even when the model supplies numeric literals. */
export function normalizeMcpQueryArguments(schema: JsonSchema, args: Record<string, unknown>): Record<string, unknown> {
  const properties = record(schema.properties) ? schema.properties : undefined
  const querySchema = properties?.url_params
  if (!record(querySchema) || !record(args.url_params)) return args
  const queryProperties = record(querySchema.properties) ? querySchema.properties : undefined
  const queryParams = args.url_params
  let changed = false
  const normalized = Object.fromEntries(Object.entries(queryParams).map(([key, value]) => {
    const fieldSchema = queryProperties?.[key] ?? querySchema.additionalProperties
    if (record(fieldSchema) && fieldSchema.type === 'string' &&
        (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean')) {
      changed = true
      return [key, String(value)]
    }
    return [key, value]
  }))
  return changed ? { ...args, url_params: normalized } : args
}
