import {execFile} from 'node:child_process'
import {existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import type {LidGuard} from './controller'

const LABEL = 'com.evanarts.sherlock.sleep-guard'
const PLIST = `/Library/LaunchDaemons/${LABEL}.plist`
const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`
const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const appleString = (text: string) => '"' + text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '\\r').replaceAll('\n', '\\n') + '"'
type Run = (file: string, args: string[], timeout?: number) => Promise<string>
const runCommand: Run = (file, args, timeout = 5000) => new Promise((resolve, reject) => {
  execFile(file, args, {timeout, maxBuffer: 128 * 1024, encoding: 'utf8', env: {...process.env, LC_ALL: 'C'}}, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, {stderr}))
    else resolve(stdout)
  })
})

export function parseSleepDisabled(output: string): boolean {
  const match = /^\s*SleepDisabled\s+([01])\s*$/mu.exec(output)
  if (!match) throw Error('System sleep state unavailable')
  return match[1] === '1'
}

function lowBattery(output: string): boolean {
  return output.split('\n').some(line => /\bdischarging\b/iu.test(line) && Number(/\b(\d+)%;/u.exec(line)?.[1] ?? 101) <= 5)
}

type GuardIdentity = {lease: string; pid: number; started: string; plist: string}

/** Embedded into a root-owned launchd plist, never loaded from a user-writable script. */
export function buildLidGuardScript(identity: GuardIdentity): string {
  if (!Number.isSafeInteger(identity.pid) || identity.pid < 1) throw Error('Invalid process identity')
  return `lease=${shellQuote(identity.lease)}
owner=${identity.pid}
started=${shellQuote(identity.started)}
plist=${shellQuote(identity.plist)}
cleanup() {
  trap - EXIT HUP INT TERM
  if /usr/bin/pmset -a disablesleep 0; then
    /bin/rm -f -- "$plist"
    /bin/launchctl bootout system/${LABEL} >/dev/null 2>&1 || :
    exit 0
  fi
  # Keep the plist on failure: launchd retries, including after a reboot.
  exit 1
}
trap cleanup EXIT HUP INT TERM
owner_alive() {
  [ -f "$lease" ] || return 1
  actual=$(LC_ALL=C /bin/ps -p "$owner" -o lstart= 2>/dev/null | /usr/bin/sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ "$actual" = "$started" ] || return 1
  battery=$(/usr/bin/pmset -g batt | /usr/bin/awk '/discharging/ {if (match($0, /[0-9]+%/)) print substr($0, RSTART, RLENGTH - 1)}')
  if [ -n "$battery" ] && [ "$battery" -le 5 ]; then return 1; fi
  modified=$(/usr/bin/stat -f %m "$lease" 2>/dev/null) || return 1
  now=$(/bin/date +%s)
  age=$((now - modified))
  [ "$age" -ge 0 ] && [ "$age" -lt 30 ]
}
if owner_alive; then
  /usr/bin/pmset -a disablesleep 1 || exit 1
  while owner_alive; do /bin/sleep 1; done
fi
exit 0
`
}

function launchPlist(script: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>-c</string><string>${xml(script)}</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>3</integer>
<key>ProcessType</key><string>Background</string>
</dict></plist>\n`
}

/** No sudoers entry, no root access to renderer arguments, one lease per app run. */
export class MacOSLidGuard implements LidGuard {
  private directory: string | undefined
  private lease: string | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private mode: 'off' | 'active' | 'external' = 'off'
  private readonly run: Run
  constructor(options: {run?: Run} = {}) {this.run = options.run ?? runCommand}

  async start(): Promise<'active' | 'external'> {
    if (this.mode !== 'off') {
      if (await this.active()) return this.mode
      await this.stop()
    }
    if (parseSleepDisabled(await this.run('/usr/bin/pmset', ['-g']))) {this.mode = 'external'; return this.mode}
    if (lowBattery(await this.run('/usr/bin/pmset', ['-g', 'batt']))) throw Error('safety-stop')
    const started = (await this.run('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='])).trim()
    if (!started) throw Error('Process identity unavailable')
    this.directory = mkdtempSync(join(tmpdir(), 'sherlock-sleep-'))
    const lease = this.lease = join(this.directory, 'active')
    writeFileSync(lease, '', {mode: 0o600})
    this.heartbeat = setInterval(() => {
      try {if (this.lease) {const now = new Date(); utimesSync(this.lease, now, now)}}
      catch {this.cancel()}
    }, 5000)
    this.heartbeat.unref()
    const script = buildLidGuardScript({lease, pid: process.pid, started, plist: PLIST})
    const plist = launchPlist(script)
    const install = `set -eu
original=$(/usr/bin/pmset -g | /usr/bin/awk '$1 == "SleepDisabled" {print $2; exit}')
case "$original" in
  1) /usr/bin/printf 'external'; exit 0 ;;
  0) ;;
  *) exit 1 ;;
esac
[ -f ${shellQuote(lease)} ] || exit 1
# An interrupted installer can leave a partial plist before bootstrap. Only
# recover our fixed, root-owned regular file while sleep is still enabled and
# no job owns it; never replace a symlink or an active guard.
if [ -f ${shellQuote(PLIST)} ] && [ ! -L ${shellQuote(PLIST)} ] && [ "$(/usr/bin/stat -f %u ${shellQuote(PLIST)})" = 0 ]; then
  if ! /bin/launchctl print system/${LABEL} >/dev/null 2>&1; then /bin/rm -f -- ${shellQuote(PLIST)}; fi
fi
[ ! -e ${shellQuote(PLIST)} ] && [ ! -L ${shellQuote(PLIST)} ] || exit 1
installed=0
rollback_install() {
  if [ "$installed" = 1 ] && ! /bin/launchctl print system/${LABEL} >/dev/null 2>&1; then /bin/rm -f -- ${shellQuote(PLIST)}; fi
}
trap rollback_install EXIT HUP INT TERM
umask 022
set -C
/usr/bin/printf '%s' ${shellQuote(plist)} > ${shellQuote(PLIST)}
installed=1
set +C
/bin/chmod 644 ${shellQuote(PLIST)}
if ! /bin/launchctl bootstrap system ${shellQuote(PLIST)}; then
  if ! /bin/launchctl print system/${LABEL} >/dev/null 2>&1; then /bin/rm -f -- ${shellQuote(PLIST)}; fi
  exit 1
fi
/usr/bin/printf 'active'
trap - EXIT HUP INT TERM
`
    try {
      const result = (await this.run('/usr/bin/osascript', ['-e', `do shell script ${appleString(install)} with administrator privileges with prompt "EWork Odyssey 需要授权以在合盖后继续运行任务。关闭开关或退出后会恢复睡眠。"`], 120000)).trim()
      if (result === 'external') {this.cancel(); this.mode = 'external'; return 'external'}
      if (result !== 'active') throw Error('Lid operation cancelled')
      this.mode = 'active'
      if (this.lease !== lease) throw Error('Lid operation cancelled')
      for (let attempt = 0; attempt < 25; attempt++) {
        if (await this.active()) return 'active'
        await delay(200)
      }
      throw Error('Sleep state not confirmed')
    } catch (error) {
      this.cancel()
      if (this.mode === 'active') {
        try {await this.stop()}
        catch {throw Error('restore-failed')}
      }
      const message = `${error instanceof Error ? error.message : ''} ${(error as {stderr?: string})?.stderr ?? ''}`
      throw Error(/\(-128\)|user cancel/iu.test(message) ? 'authorization-cancelled' : 'lid-unavailable')
    }
  }

  async active(): Promise<boolean> {
    if (this.mode === 'off') return false
    if (this.mode === 'active' && (!this.lease || !existsSync(this.lease) || !existsSync(PLIST))) return false
    return parseSleepDisabled(await this.run('/usr/bin/pmset', ['-g']))
  }

  cancel(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = undefined
    // A filesystem error must not interrupt app shutdown; the heartbeat expires.
    if (this.directory) {try {rmSync(this.directory, {recursive: true, force: true})} catch {}}
    this.lease = undefined; this.directory = undefined
  }

  async stop(): Promise<void> {
    const managed = this.mode === 'active'
    this.cancel()
    if (managed) {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (!existsSync(PLIST) && !parseSleepDisabled(await this.run('/usr/bin/pmset', ['-g']))) {
          // The previous guard removes its plist before booting its job out.
          // Wait for both so an immediate off/on cannot race the old launchd job.
          const loaded = await this.run('/bin/launchctl', ['print', `system/${LABEL}`]).then(() => true, () => false)
          if (!loaded) {this.mode = 'off'; return}
        }
        await delay(250)
      }
      throw Error('restore-failed')
    }
    this.mode = 'off'
  }
}
