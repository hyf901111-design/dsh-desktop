import { isAbsolute, relative, resolve } from 'node:path'
import { collaborationOrigin } from './collaboration-client'

/** Local acceptance uses the production clients with disposable data and a
 * loopback service. Ordinary launches retain the production destination. */
export function localAcceptanceOrigin(
  switches: { origin: string; userData: string; appData: string },
  temporaryDirectory: string
): string | undefined {
  if (!switches.origin) return undefined
  if (resolve(switches.userData) === resolve(switches.appData)) throw new Error('Acceptance data directories must be distinct.')
  for (const path of [switches.userData, switches.appData]) {
    const child = relative(resolve(temporaryDirectory), resolve(path))
    if (!isAbsolute(path) || !child || child.startsWith('..') || isAbsolute(child)) {
      throw new Error('Local acceptance requires separate temporary user-data and app-data directories.')
    }
  }
  const origin = collaborationOrigin(switches.origin)
  if (!origin.startsWith('http://')) throw new Error('Local acceptance requires a loopback HTTP service.')
  return origin
}
