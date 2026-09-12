import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { isAbsolute, join, normalize, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { resolveDesktopIdentity } from '../src/main/app-identity'

const source = await readFile('src/main/index.ts', 'utf8')
const identity = source.slice(source.indexOf('function configureAppIdentity('), source.indexOf('\nasync function syncNativeTheme('))
const startup = source.slice(source.indexOf('\nconst initializeAppData ='), source.indexOf("\n  app.on('activate',")) + '\n}'
const code = ts.transpileModule(identity + startup, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

describe('desktop single-instance profile ownership', () => {
  for (const ownsLock of [false, true]) {
    it(`${ownsLock ? 'initializes' : 'does not touch'} shared data when the instance ${ownsLock ? 'owns' : 'loses'} the lock`, async () => {
      const events: string[] = []
      const paths: Record<string, string> = { appData: '/tmp/app-data' }
      let ready: (() => unknown) | undefined
      runInNewContext(code, {
        app: {
          isPackaged: true,
          commandLine: { getSwitchValue: () => '' },
          getPath: (name: string) => paths[name],
          setPath: (name: string, value: string) => { paths[name] = value },
          getVersion: () => '0.9.5',
          requestSingleInstanceLock: () => { events.push('lock'); expect(paths.userData).toBe('/tmp/app-data/sherlock-desktop'); return ownsLock },
          quit: () => events.push('quit'),
          on: () => {},
          whenReady: () => ({ then: (callback: () => unknown) => { ready = callback; return { catch: () => {} } } })
        },
        process: { env: {}, resourcesPath: '/tmp/resources' },
        desktopChannel: 'notarized', resolveDesktopIdentity,
        configureDesktopName: () => {}, configureApplicationLocale: () => {},
        migrateLegacyUserData: () => events.push('migrate'),
        synchronizeBundledESkillOverrides: () => { events.push('skills'); return { upgraded: [] } },
        installBundledPluginProfile: () => { events.push('plugins'); return { installed: false } },
        bootstrap: () => events.push('bootstrap'),
        homedir: () => '/tmp/home', isAbsolute, normalize, join, resolve, console
      })
      expect(events).toEqual(ownsLock ? ['lock'] : ['lock', 'quit'])
      if (ownsLock) {
        expect(ready).toBeTypeOf('function')
        await ready!()
        expect(events).toEqual(['lock', 'migrate', 'skills', 'plugins', 'bootstrap'])
      } else expect(ready).toBeUndefined()
    })
  }
})
