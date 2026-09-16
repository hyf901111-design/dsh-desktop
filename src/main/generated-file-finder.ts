import { basename, isAbsolute, relative, resolve } from 'node:path'

/** Mirror the preview's exact-name, unique, non-truncated search contract. */
export function generatedFileFinderPath(
  result: unknown,
  fileName: string,
  cwd: string,
  exists: (path: string) => boolean
): string {
  if (!result || typeof result !== 'object') return ''
  const value = result as { matches?: unknown; truncated?: unknown }
  if (value.truncated !== false || !Array.isArray(value.matches)) return ''
  const matches = value.matches.filter((entry): entry is string =>
    typeof entry === 'string' && basename(entry) === fileName)
  if (matches.length !== 1) return ''
  const target = resolve(cwd, matches[0]!)
  const within = relative(cwd, target)
  if (isAbsolute(within) || within === '..' || within.startsWith('../')) return ''
  return exists(target) ? target : ''
}
