import {execFile} from 'node:child_process'
import {closeSync, constants, fstatSync, lstatSync, openSync, readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

export type PowerServiceStatus = {version: 1; implementationVersion?: number; servicePid: number; mode: 'idle'|'active'|'external'|'safety-stop'|'system-changed'|'error'; ownerPid: number; token: string|null}
export type PowerService = {readonly directory: string; isReady(): Promise<boolean>; install(): Promise<void>; status(): Promise<PowerServiceStatus>}
export type PowerCommand = (file: string, args: string[], timeout?: number) => Promise<string>
export const runPowerCommand: PowerCommand = (file, args, timeout = 5000) => new Promise((resolve, reject) => {
  execFile(file, args, {timeout, maxBuffer: 128 * 1024, encoding: 'utf8', env: {...process.env, LC_ALL: 'C'}}, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, {stderr}))
    else resolve(stdout)
  })
})

const HELPER = '/Library/PrivilegedHelperTools/com.evanarts.sherlock.power-helper'
const ROOT = '/Library/Application Support/EWork Odyssey/Power'
const REQUIREMENT = '=identifier "com.evanarts.sherlock.power-helper" and anchor apple generic and certificate leaf[subject.OU] = "FAV8TLDK73"'
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const appleString = (value: string) => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '\\r').replaceAll('\n', '\\n') + '"'
const modes = new Set(['idle', 'active', 'external', 'safety-stop', 'system-changed', 'error'])

export function parsePowerServiceStatus(source: string): PowerServiceStatus {
  const value = JSON.parse(source)
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.servicePid) || value.servicePid < 2 || !Number.isSafeInteger(value.ownerPid) || value.ownerPid < 0 || !modes.has(value.mode) || (value.token !== null && (typeof value.token !== 'string' || !/^[a-f0-9]{32}$/u.test(value.token)))) throw Error('helper-unavailable')
  if (value.implementationVersion !== undefined && (!Number.isSafeInteger(value.implementationVersion) || value.implementationVersion < 1)) throw Error('helper-unavailable')
  return value as PowerServiceStatus
}

function rootOwned(path: string, directory = false): boolean {
  try {const stat = lstatSync(path); return stat.uid === 0 && (stat.mode & 0o022) === 0 && (directory ? stat.isDirectory() : stat.isFile())}
  catch {return false}
}

/** Installation is the only privileged call. Normal launches use the file lease. */
export class MacOSPowerService implements PowerService {
  readonly directory: string
  private readonly uid: number
  private readonly base: string
  private readonly label: string
  private readonly plist: string
  private readonly run: PowerCommand
  private readonly helperSource: string
  constructor(options: {helperSource?: string; run?: PowerCommand} = {}) {
    this.uid = process.getuid?.() ?? 0
    if (!Number.isSafeInteger(this.uid) || this.uid < 1) throw Error('helper-unavailable')
    this.base = join(ROOT, String(this.uid)); this.directory = join(this.base, 'leases')
    this.label = `com.evanarts.sherlock.power-helper.${this.uid}`
    this.plist = `/Library/LaunchDaemons/${this.label}.plist`
    this.run = options.run ?? runPowerCommand
    this.helperSource = options.helperSource ?? join(process.resourcesPath ?? process.cwd(), 'native', 'sherlock-power-helper')
  }
  async status(): Promise<PowerServiceStatus> {
    if (!rootOwned(ROOT, true) || !rootOwned(this.base, true)) throw Error('helper-unavailable')
    const descriptor = openSync(join(this.base, 'status.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = fstatSync(descriptor)
      if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.size > 4096) throw Error('helper-unavailable')
      return parsePowerServiceStatus(readFileSync(descriptor, 'utf8'))
    } finally {closeSync(descriptor)}
  }
  async isReady(): Promise<boolean> {
    try {
      if (!rootOwned(HELPER) || !rootOwned(this.plist)) return false
      const status = await this.status()
      // The shared file can be replaced while another UID still runs an older
      // daemon. Its own root-written status must identify the fixed build too.
      if (status.implementationVersion !== 2) return false
      // A stale lease rejection does not prevent a fresh client handshake.
      await this.run('/usr/bin/codesign', ['--verify', '--strict', '-R', REQUIREMENT, HELPER])
      if ((await this.run(HELPER, ['--version'])).trim() !== '2') return false
      const job = await this.run('/bin/launchctl', ['print', `system/${this.label}`])
      return /\bstate = running\b/u.test(job) && new RegExp(`\\bpid = ${status.servicePid}\\b`, 'u').test(job)
    } catch {return false}
  }
  async install(): Promise<void> {
    const sourceStat = lstatSync(this.helperSource)
    if (!sourceStat.isFile() || sourceStat.size > 5 * 1024 * 1024) throw Error('helper-unavailable')
    const digest = createHash('sha256').update(readFileSync(this.helperSource)).digest('hex')
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${this.label}</string><key>ProgramArguments</key><array><string>${xml(HELPER)}</string><string>--uid</string><string>${this.uid}</string></array><key>AssociatedBundleIdentifiers</key><array><string>com.evanarts.sherlock</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer><key>ExitTimeOut</key><integer>10</integer><key>ProcessType</key><string>Background</string></dict></plist>\n`
    const script = `set -eu
root_dir() {
  if [ ! -e "$1" ] && [ ! -L "$1" ]; then /bin/mkdir -m 755 "$1"; fi
  [ -d "$1" ] && [ ! -L "$1" ] && [ "$(/usr/bin/stat -f %u "$1")" = 0 ] || exit 1
  permissions=$(/usr/bin/stat -f %Lp "$1")
  [ "$permissions" = 755 ] || exit 1
}
root_dir /Library/PrivilegedHelperTools
root_dir '/Library/Application Support/EWork Odyssey'
root_dir ${quote(ROOT)}
root_dir ${quote(this.base)}
if [ ! -e ${quote(this.directory)} ] && [ ! -L ${quote(this.directory)} ]; then /usr/bin/install -d -o ${this.uid} -g staff -m 700 ${quote(this.directory)}; fi
[ -d ${quote(this.directory)} ] && [ ! -L ${quote(this.directory)} ] && [ "$(/usr/bin/stat -f %u ${quote(this.directory)})" = ${this.uid} ] || exit 1
/bin/chmod 700 ${quote(this.directory)}
stage=$(/usr/bin/mktemp -d /Library/PrivilegedHelperTools/.ework-power.XXXXXX)
trap '/bin/rm -rf "$stage"' EXIT HUP INT TERM
/bin/chmod 700 "$stage"
# Copy first, then validate the immutable root-owned copy before installing it.
/bin/cp ${quote(this.helperSource)} "$stage/helper"
/usr/sbin/chown root:wheel "$stage/helper"
/bin/chmod 755 "$stage/helper"
actual=$(/usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin LC_ALL=C /usr/bin/shasum -a 256 "$stage/helper" | /usr/bin/awk '{print $1}')
[ "$actual" = ${quote(digest)} ] || exit 1
/usr/bin/codesign --verify --strict -R ${quote(REQUIREMENT)} "$stage/helper"
[ "$("$stage/helper" --version)" = 2 ] || exit 1
legacy='/Library/LaunchDaemons/com.evanarts.sherlock.sleep-guard.plist'
if [ -e "$legacy" ] || [ -L "$legacy" ]; then
  [ -f "$legacy" ] && [ ! -L "$legacy" ] && [ "$(/usr/bin/stat -f %u "$legacy")" = 0 ] || exit 1
  /bin/launchctl bootout system/com.evanarts.sherlock.sleep-guard >/dev/null 2>&1 || :
  # Its plist is the legacy guard's recovery record. Never delete it while an
  # owned override or loaded job could remain after a failed restoration.
  old_state=$(/usr/bin/pmset -g | /usr/bin/awk '$1 == "SleepDisabled" {print $2; exit}')
  [ "$old_state" = 0 ] || exit 1
  if /bin/launchctl print system/com.evanarts.sherlock.sleep-guard >/dev/null 2>&1; then exit 1; fi
  /bin/rm -f "$legacy"
fi
/bin/launchctl bootout system/${this.label} >/dev/null 2>&1 || :
if [ -e ${quote(HELPER)} ] || [ -L ${quote(HELPER)} ]; then [ -f ${quote(HELPER)} ] && [ ! -L ${quote(HELPER)} ] && [ "$(/usr/bin/stat -f %u ${quote(HELPER)})" = 0 ] || exit 1; fi
if [ -e ${quote(this.plist)} ] || [ -L ${quote(this.plist)} ]; then [ -f ${quote(this.plist)} ] && [ ! -L ${quote(this.plist)} ] && [ "$(/usr/bin/stat -f %u ${quote(this.plist)})" = 0 ] || exit 1; fi
/usr/bin/printf '%s' ${quote(plist)} > "$stage/service.plist"
/bin/chmod 644 "$stage/service.plist"
/bin/mv -f "$stage/helper" ${quote(HELPER)}
/bin/mv -f "$stage/service.plist" ${quote(this.plist)}
/bin/launchctl bootstrap system ${quote(this.plist)}
`
    try {
      await this.run('/usr/bin/osascript', ['-e', `do shell script ${appleString(script)} with administrator privileges with prompt "EWork Odyssey 需要安装电源辅助服务。仅首次安装需要授权，以后会随客户端自动恢复合盖运行。"`], 120000)
    } catch (error) {
      const message = `${error instanceof Error ? error.message : ''} ${(error as {stderr?: string})?.stderr ?? ''}`
      throw Error(/\(-128\)|user cancel/iu.test(message) ? 'authorization-cancelled' : 'helper-unavailable')
    }
    for (let attempt = 0; attempt < 20; attempt++) {if (await this.isReady()) return; await delay(300)}
    throw Error('helper-unavailable')
  }
}
