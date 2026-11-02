import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const fixtures: string[] = []

async function executable(filePath: string, contents: string): Promise<void> {
  await writeFile(filePath, contents, 'utf8')
  await chmod(filePath, 0o755)
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true })))
})

describe('formal EWork Odyssey build and run', () => {
  it.each([true, false])('preserves a copied same-name app and only verifies its own launch (started=%s)', async started => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'sherlock-build-[qa].$-'))
    fixtures.push(fixture)
    const scriptDirectory = path.join(fixture, 'script'), fakeBin = path.join(fixture, 'fake-bin')
    await mkdir(scriptDirectory); await mkdir(fakeBin)
    const target = path.join(fixture, 'dist-notarized/mac-arm64/EWork Odyssey.app/Contents/MacOS/EWork Odyssey')
    const foreign = path.join(fixture, 'PPT comparison/EWork Odyssey.app/Contents/MacOS/EWork Odyssey')
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
    await writeFile(path.join(scriptDirectory, 'build_and_run.sh'), await readFile(path.resolve('script/build_and_run.sh'), 'utf8'))
    await writeFile(path.join(fixture, 'target.command'), target + ' --sherlock-app-version=1.4.3\n')
    await writeFile(path.join(fixture, 'foreign.command'), foreign + ' --sherlock-user-data-dir=independent\n')
    await writeFile(path.join(fixture, 'target.alive'), 'old')
    await writeFile(path.join(fixture, 'foreign.alive'), 'independent')
    const matcher = `fixture=${quote(fixture)}
[ "$1" = '-f' ] || exit 7
pattern="$2"
matched=1
for kind in target foreign; do
  if [ -f "$fixture/$kind.alive" ] && grep -E -- "$pattern" "$fixture/$kind.command" >/dev/null; then
    matched=0
    if [ "$action" = stop ]; then
      rm "$fixture/$kind.alive"
      printf '%s\\n' "$kind" >> "$fixture/stopped"
    fi
  fi
done
exit "$matched"
`
    await executable(path.join(fakeBin, 'uname'), '#!/bin/sh\necho arm64\n')
    await executable(path.join(fakeBin, 'sleep'), '#!/bin/sh\nexit 0\n')
    await executable(path.join(fakeBin, 'pkill'), '#!/bin/sh\naction=stop\n' + matcher)
    await executable(path.join(fakeBin, 'pgrep'), '#!/bin/sh\naction=check\n' + matcher)
    await executable(path.join(fakeBin, 'codesign'), '#!/bin/sh\nexit 0\n')
    await executable(path.join(fakeBin, 'npm'), `#!/bin/sh
fixture=${quote(fixture)}
case "$*" in
 'rebuild node') mkdir -p "$fixture/node_modules/node/bin"; touch "$fixture/node_modules/node/bin/node"; chmod +x "$fixture/node_modules/node/bin/node" ;;
 'run package:formal:dir')
  app="$fixture/dist-notarized/mac-arm64/EWork Odyssey.app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/app/node_modules/node/bin"
  touch "$app/Contents/MacOS/EWork Odyssey" "$app/Contents/Resources/app/node_modules/node/bin/node"
  chmod +x "$app/Contents/MacOS/EWork Odyssey" "$app/Contents/Resources/app/node_modules/node/bin/node"
  # A launch during packaging must be closed again, without closing the copy.
  touch "$fixture/target.alive" ;;
 *) exit 2 ;;
esac
`)
    await executable(path.join(fakeBin, 'open'), `#!/bin/sh
fixture=${quote(fixture)}
test ! -f "$fixture/target.alive" || exit 9
test -f "$fixture/foreign.alive" || exit 10
${started ? 'touch "$fixture/target.alive"' : ':'}
`)
    const result = spawnSync('/bin/bash', [path.join(scriptDirectory, 'build_and_run.sh'), '--verify'], {
      encoding: 'utf8', timeout: 20_000, env: { ...process.env, PATH: `${fakeBin}:/usr/bin:/bin` }
    })
    expect(result.status, result.stderr).toBe(started ? 0 : 1)
    expect(await readFile(path.join(fixture, 'foreign.alive'), 'utf8')).toBe('independent')
    expect((await readFile(path.join(fixture, 'stopped'), 'utf8')).trim().split('\n')).toEqual(['target', 'target'])
    if (started) expect(result.stdout).toContain('EWork Odyssey is running.')
    else expect(result.stderr).toContain('EWork Odyssey did not stay running.')
  }, 30_000)

  it('embeds the notarized update feed in local directory builds', async () => {
    const builderConfig = await readFile(
      path.resolve('electron-builder.notarized.cjs'),
      'utf8'
    )
    const updateConfig = await readFile(
      path.resolve('build/app-update-notarized.yml'),
      'utf8'
    )

    expect(builderConfig).toContain("from: 'build/app-update-notarized.yml'")
    expect(builderConfig).toContain("to: 'app-update.yml'")
    expect(updateConfig).toContain('provider: generic')
    expect(updateConfig).toContain(
      'url: https://updates.evanarts.com/notarized/latest/'
    )
    expect(updateConfig).toContain('updaterCacheDirName: sherlock-updater')
  })

  it('repairs a missing workspace Node runtime before packaging a local test app', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'sherlock-build-and-run-repair-'))
    fixtures.push(fixture)

    const scriptDirectory = path.join(fixture, 'script')
    const fakeBinDirectory = path.join(fixture, 'fake-bin')
    const packagedApp = path.join(
      fixture,
      'dist-notarized/mac-arm64/EWork Odyssey.app'
    )
    await mkdir(scriptDirectory)
    await mkdir(fakeBinDirectory)
    await writeFile(
      path.join(scriptDirectory, 'build_and_run.sh'),
      await readFile(path.resolve('script/build_and_run.sh'), 'utf8'),
      'utf8'
    )

    await executable(path.join(fakeBinDirectory, 'uname'), '#!/bin/sh\necho arm64\n')
    await executable(path.join(fakeBinDirectory, 'pkill'), `#!/bin/sh\nrm -f "${fixture}/old-process"\n`)
    await executable(path.join(fakeBinDirectory, 'pgrep'), `#!/bin/sh\ntest -f "${fixture}/old-process"\n`)
    await executable(
      path.join(fakeBinDirectory, 'npm'),
      `#!/bin/sh
case "$*" in
  "rebuild node")
    mkdir -p "${fixture}/node_modules/node/bin"
    touch "${fixture}/node_modules/node/bin/node"
    chmod +x "${fixture}/node_modules/node/bin/node"
    ;;
  "run package:formal:dir")
    # Another launch during packaging must not survive the final launch step.
    touch "${fixture}/old-process"
    mkdir -p "${packagedApp}/Contents/MacOS"
    touch "${packagedApp}/Contents/MacOS/EWork Odyssey"
    chmod +x "${packagedApp}/Contents/MacOS/EWork Odyssey"
    if [ -x "${fixture}/node_modules/node/bin/node" ]; then
      mkdir -p "${packagedApp}/Contents/Resources/app/node_modules/node/bin"
      cp "${fixture}/node_modules/node/bin/node" \
        "${packagedApp}/Contents/Resources/app/node_modules/node/bin/node"
    fi
    ;;
  *)
    exit 2
    ;;
esac
`
    )
    await executable(path.join(fakeBinDirectory, 'codesign'), '#!/bin/sh\nexit 0\n')
    await executable(
      path.join(fakeBinDirectory, 'open'),
      `#!/bin/sh
test ! -f "${fixture}/old-process" || exit 9
printf '%s\n' "$*" > "${fixture}/opened-app.txt"
`
    )

    const result = spawnSync(
      '/bin/bash',
      [path.join(scriptDirectory, 'build_and_run.sh'), '--run'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBinDirectory}:/usr/bin:/bin`
        }
      }
    )

    expect(result.status, result.stderr).toBe(0)
    expect(await readFile(path.join(fixture, 'opened-app.txt'), 'utf8')).toContain(
      packagedApp
    )
  })

  it('refuses to launch a package whose bundled Node runtime is missing', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'sherlock-build-and-run-'))
    fixtures.push(fixture)

    const scriptDirectory = path.join(fixture, 'script')
    const fakeBinDirectory = path.join(fixture, 'fake-bin')
    await mkdir(scriptDirectory)
    await mkdir(fakeBinDirectory)
    await writeFile(
      path.join(scriptDirectory, 'build_and_run.sh'),
      await readFile(path.resolve('script/build_and_run.sh'), 'utf8'),
      'utf8'
    )

    await executable(path.join(fakeBinDirectory, 'uname'), '#!/bin/sh\necho arm64\n')
    await executable(path.join(fakeBinDirectory, 'pkill'), '#!/bin/sh\nexit 0\n')
    await executable(path.join(fakeBinDirectory, 'pgrep'), '#!/bin/sh\nexit 1\n')
    await executable(
      path.join(fakeBinDirectory, 'npm'),
      `#!/bin/sh
if [ "$*" = "rebuild node" ]; then
  mkdir -p "${fixture}/node_modules/node/bin"
  touch "${fixture}/node_modules/node/bin/node"
  chmod +x "${fixture}/node_modules/node/bin/node"
else
  mkdir -p "${fixture}/dist-notarized/mac-arm64/EWork Odyssey.app/Contents/MacOS"
  touch "${fixture}/dist-notarized/mac-arm64/EWork Odyssey.app/Contents/MacOS/EWork Odyssey"
  chmod +x "${fixture}/dist-notarized/mac-arm64/EWork Odyssey.app/Contents/MacOS/EWork Odyssey"
fi
`
    )
    await executable(path.join(fakeBinDirectory, 'codesign'), '#!/bin/sh\nexit 0\n')
    await executable(path.join(fakeBinDirectory, 'open'), '#!/bin/sh\nexit 0\n')

    const result = spawnSync(
      '/bin/bash',
      [path.join(scriptDirectory, 'build_and_run.sh'), '--run'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBinDirectory}:/usr/bin:/bin`
        }
      }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Bundled Node.js runtime was not built')
  })
})
