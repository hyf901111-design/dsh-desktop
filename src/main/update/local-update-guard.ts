import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'

export interface LocalUpdateEnvironment {
  /** Returned by localAcceptanceOrigin(), never taken directly from a renderer. */
  acceptanceOrigin?: string
  feed: string
  feedRequested: boolean
  userData: string
  appData: string
}
export interface LocalUpdatePaths { feed: string; userData: string; appData: string }

function descendant(parent: string, child: string): boolean {
  const part = relative(parent, child)
  return !!part && part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part)
}

export async function validateLocalUpdateEnvironment(input: LocalUpdateEnvironment, temporaryDirectory: string): Promise<LocalUpdatePaths> {
  if (!input.acceptanceOrigin || !input.feedRequested) throw Error('Local update checks require validated local acceptance mode.')
  const acceptance = new URL(input.acceptanceOrigin)
  if (acceptance.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(acceptance.hostname) || acceptance.username || acceptance.password) {
    throw Error('Local update checks require a validated loopback acceptance origin.')
  }
  // Validate the literal too: URL normalizes alternate IP notation and default ports.
  if (!/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/?$/.test(input.feed)) throw Error('Local update feed must be an explicit 127.0.0.1 HTTP origin.')
  const feed = new URL(input.feed)
  if (!feed.port || Number(feed.port) > 65535) throw Error('Local update feed requires a non-default explicit port.')
  if (![input.userData, input.appData].every(isAbsolute)) throw Error('Local update data paths must be absolute.')
  const [temporary, userData, appData] = await Promise.all([realpath(temporaryDirectory), realpath(input.userData), realpath(input.appData)])
  if (![userData, appData].every(p => descendant(temporary, p)) || userData === appData || descendant(userData, appData) || descendant(appData, userData)) {
    throw Error('Local update checks require distinct, non-nested real directories inside tmpdir.')
  }
  for (const path of [userData, appData]) if (!(await stat(path)).isDirectory()) throw Error('Local update paths must be existing directories.')
  return { feed: feed.origin, userData, appData }
}
