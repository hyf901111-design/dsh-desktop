import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const [dshEntryPath, ...dshArguments] = process.argv.slice(2)

function superviseDesktopParent() {
  const value = process.env.SHERLOCK_DESKTOP_PARENT_PID
  if (!/^\d+$/.test(value ?? '')) return true
  const parentPid = Number(value)
  if (!Number.isSafeInteger(parentPid) || parentPid <= 1) return true

  let stopping = false
  let timer
  const parentIsAlive = () => {
    // Reparenting also detects a dead owner whose PID has already been reused.
    if (process.ppid !== parentPid) return false
    try {
      process.kill(parentPid, 0)
      return true
    } catch (error) {
      return error?.code === 'EPERM'
    }
  }
  const stop = () => {
    if (stopping) return
    stopping = true
    clearInterval(timer)
    // Use the CLI's normal shutdown handler, with a bounded fallback if it hangs.
    // The desktop's pipes may already be closed, so do not write to them here.
    setTimeout(() => process.exit(0), 4000).unref()
    process.kill(process.pid, 'SIGTERM')
  }
  if (!parentIsAlive()) {
    stop()
    return false
  }
  timer = setInterval(() => {
    if (!parentIsAlive()) stop()
  }, 1000)
  timer.unref()
  process.once('exit', () => clearInterval(timer))
  return true
}

const desktopParentAlive = superviseDesktopParent()

function report(label, value) {
  process.stderr.write(`[harness-node] ${label}: ${value}\n`)
}

process.on('uncaughtException', (error) => report('uncaught exception', error?.stack ?? error))
process.on('unhandledRejection', (error) => report('unhandled rejection', error?.stack ?? error))

process.stdout.write(
  `[harness-node] runtime node=${process.version} platform=${process.platform} arch=${process.arch}\n`
)
process.stdout.write(`[harness-node] execPath=${process.execPath}\n`)
process.stdout.write(`[harness-node] cwd=${process.cwd()}\n`)
process.stdout.write(`[harness-node] DSH_HOME=${process.env.DSH_HOME ?? ''}\n`)

const bundledWebSearchEntry = process.env.DSH_DESKTOP_WEB_SEARCH_ENTRY
const bundledMarketInstallerEntry = process.env.DSH_DESKTOP_MARKET_INSTALLER_ENTRY
const bundledResearchTaskEntry = process.env.DSH_DESKTOP_RESEARCH_TASK_ENTRY
const bundledFundResearchEntry = process.env.DSH_DESKTOP_FUND_RESEARCH_ENTRY
const bundledIntegrationEntry = process.env.DSH_DESKTOP_INTEGRATION_ENTRY
const bundledMemoryEntry = process.env.DSH_DESKTOP_MEMORY_ENTRY
const bundledPackageEntries = new Map([
  ...(bundledMemoryEntry ? [['dsh-memory-runtime', bundledMemoryEntry]] : []),
  ...(bundledIntegrationEntry ? [['dsh-integration-runtime', bundledIntegrationEntry]] : []),
  ...(bundledWebSearchEntry
    ? [['dsh-web-search-session-model', bundledWebSearchEntry]]
    : []),
  ...(bundledMarketInstallerEntry
    ? [['dsh-desktop-market-installer', bundledMarketInstallerEntry]]
    : []),
  ...(bundledResearchTaskEntry
    ? [['dsh-research-task-runtime', bundledResearchTaskEntry]]
    : []),
  ...(bundledFundResearchEntry
    ? [['dsh-fund-research-runtime', bundledFundResearchEntry]]
    : [])
])
if (bundledPackageEntries.size > 0) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const bundledEntry = bundledPackageEntries.get(specifier)
      if (bundledEntry) return { url: bundledEntry, shortCircuit: true }
      return nextResolve(specifier, context)
    }
  })
}
if (bundledWebSearchEntry) {
  process.stdout.write('[harness-node] bundled session-model web search mapped\n')
}
if (bundledMarketInstallerEntry) {
  process.stdout.write('[harness-node] bundled market installer mapped\n')
}
if (bundledResearchTaskEntry) {
  process.stdout.write('[harness-node] bundled Research task runtime mapped\n')
}
if (bundledFundResearchEntry) {
  process.stdout.write('[harness-node] bundled fund research runtime mapped\n')
}

if (!desktopParentAlive) {
  // The owning desktop exited before this entry was ready; do not start work.
} else if (!dshEntryPath) {
  report('startup error', 'missing DSH entry path')
  process.exitCode = 1
} else {
  process.stdout.write(`[harness-node] loading=${dshEntryPath}\n`)
  process.argv = [process.execPath, dshEntryPath, ...dshArguments]
  try {
    await import(pathToFileURL(dshEntryPath).href)
    process.stdout.write('[harness-node] DSH entry loaded\n')
  } catch (error) {
    report('DSH entry failed', error?.stack ?? error)
    process.exitCode = 1
  }
}
