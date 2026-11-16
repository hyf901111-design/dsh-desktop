import { KnowledgeContent } from './knowledge/content'
import { researchPdfModules } from './research/research-pdf-navigation'
import { KnowledgeSharing } from './knowledge/sharing'
import { KnowledgeViewBridge } from './knowledge/view-bridge'
import { knowledgeCapabilityHandlers, sharedKnowledgeCapabilityHandlers } from './knowledge/capabilities'
import { KnowledgeFilePreview } from './knowledge/file-preview'
import { KnowledgeStore } from './knowledge/store'
import { installKnowledgeIpc } from './knowledge/ipc'
import { scanKnowledgeHistory } from './knowledge/history-backfill'
import { researchHasContent } from './knowledge/session-content'
import { createKnowledgeSessionCopier, knowledgeCopyRetention, retainExistingKnowledgeCopies } from './knowledge/session-copy'
import type { KnowledgeSessionMode } from '../shared/knowledge-sessions'
import { createKnowledgeSessionSnapshot } from './knowledge/session-share'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import {routeBrowserUse} from './browser/route'
import {registerBrowserApp} from './browser/service'
import {ClientCapabilityService,installClientCapabilityBinding} from './state/client-capability-service'
import {ConversationComponentStore} from './state/conversation-components'
import {createConversationComponentService} from './conversation-components/service'
import {installConversationComponentHandlers} from './conversation-components/ipc'
import {registerDeliveryFileClipboard} from './delivery-file-clipboard'
import {registerImageActions} from './image-actions'
import { ImageFactoryCanvases } from './state/image-factory-canvases'
import type { CanvasScope, CanvasWrite } from '../shared/image-factory-canvas'
import { PptxEditorService, registerPptxEditorHandlers } from './pptx/service'
import { PptxAnnotationService, registerPptxAnnotationHandlers, type PptxAnnotationHistoryEvent } from './pptx/annotations'
import { createHomeGuideAssetService, registerHomeGuideAssetHandlers } from './home-guide-assets'
import {createPublicFinancialWidgetData} from './financial/public-widget-data'
import {installCalendarService} from './calendar/calendar-service'
import {SharedCalendarStore} from './calendar/shared-calendar-store'
import {installComponentLibrary} from './state/component-library'
import { createComponentDataService } from './component-data/service'
import { legacyConnectionSources } from './integrations/legacy-connections'
import { legacySkillRoots } from './integrations/legacy-skills'
import { IntegrationService } from './integrations/service'
import { maySkipGrantedToolPrompt } from './integrations/granted-tool-approval'
import { startIntegrationBridge } from './integrations/runtime-bridge'
import { registerIntegrationIpc } from './integrations/ipc'
import { MemoryService } from './memory/service'
import { startMemoryBridge } from './memory/bridge'
import { registerMemoryIpc } from './memory/ipc'
import { resolveIntegrationContext } from './integrations/context'
import { DependencyIndex } from './integrations/dependency-index'
import { GoogleCalendarAdapter } from './integrations/adapters/google-calendar'
import { NotionAdapter } from './integrations/adapters/notion'
import { IntegrationError } from '../shared/integrations'
import { ScheduledComponentExecutor } from './scheduled/component-executor'
import { validateTask } from '../shared/scheduled-tasks'
import { generateTaskTitle } from './scheduled/task-title'
import { TaskStore } from './scheduled/task-store'
import { TaskRunner, harnessRpc } from './scheduled/task-runner'
import { ScheduledMarketWatchExecutor } from './scheduled/market-watch-executor'
import { createScheduledTaskService } from './scheduled/task-service'
import { createPublicDataClient } from '../../packages/dsh-research-task-runtime/public-data-client.js'
import { createComputerCandidates } from './computer/candidates'
import { registerConversationBrowser } from './search/conversation-browser'
import {openClientLink} from './search/open-client-link'
import { guardUnexpectedErrorDownloads } from './search/research-web-downloads'
import { readBrowserPage } from './search/browser-page-reader'
import { installWindowResize } from './window-resize'
import { registerResearchNativeWeb } from './state/research-native-web'
import { ResearchWebNavigationStore } from './state/research-web-navigation'
import { ResearchWebSessionPersistence } from './state/research-web-session'
import { registerResearchYoutubeNative } from './state/research-youtube-native'
import { registerCanvasUseWeb } from './state/canvas-use-web'
import {createGenerationDeliveryLog,GENERATION_DELIVERY_PREFIX} from './state/generation-delivery-log'
import {createNotesGuideDiagnosticLog,recordNotesGuideConsoleMessage} from './state/notes-guide-diagnostics'
import {NOTES_GUIDE_DIAGNOSTIC_PREFIX} from '../shared/notes-guide-diagnostics'
import {createHomeGuideEntryDiagnosticLog,recordHomeGuideEntryConsoleMessage} from './state/home-guide-entry-diagnostics'
import {HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX} from '../shared/home-guide-entry-diagnostics'
import { copyResearchFile } from './state/research-owned-files'
import {randomUUID} from 'node:crypto'
import { ResearchBoardIntegration } from './research-board-integration'
import { finishQuitCleanup } from './quit-cleanup'
import { AccountService } from './account-service'
import { CollaborationClient } from './collaboration-client'
import { ResearchBoardsStore } from './state/research-boards-store'
import {
  ResearchBoardsService,
  registerResearchBoardsHandlers
} from './research-boards-service'
import { installSpreadsheet } from './spreadsheet/ipc'
import { SpreadsheetStore } from './spreadsheet/store'
import { isTrustedMainWindowEvent, registerTrustedMainWindowHandler } from './ipc-trust'
import { spawn } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { localAcceptanceOrigin } from './local-acceptance-services'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { parse } from 'yaml'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  systemPreferences,
  safeStorage,
  net,
  protocol,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type SaveDialogOptions
} from 'electron'
import {
  extractDuplicateLoaderEntryId,
  extractFailureCause,
  extractPluginFailureReferences,
  extractSlotConflictName,
  HarnessRuntime
} from './runtime/harness-runtime'
import { removeProfilePluginWithDsh } from './runtime/profile-plugin-command'
import { secureWindow } from './security'
import { ensureLaunchRoot } from './state/launch-root'
import {
  resetPluginProfile,
  resolveProfileRecoveryPlugins,
  uninstallPluginFromProfile
} from './state/plugin-recovery'
import { isAbortedNavigationError, shouldLoadHarnessUrl } from './window-navigation'
import {
  checkForUpdates,
  initializeLocalUpdateChecks,
  registerUpdateHandlers,
  setUpdateRestartPreparation,
  startUpdateManager,
  stopUpdateManager
} from './update/update-manager'
import { prepareUpdateRestart } from './update/restart-preparation'
import type { RuntimeSnapshot } from '../shared/contracts'
import { resolveHarnessLocale } from './application-locale'
import { installContextMenu } from './context-menu'
import { isDeveloperModeEnabled, setDeveloperModeEnabled } from './developer-mode-state'
import {
  WINDOWS_TITLEBAR_HEIGHT,
  isDesktopMenuCommand,
  type DesktopMenuCommand
} from '../shared/desktop-menu'
import { developerModeArgument } from '../shared/developer-mode'
import { appVersionArgument } from '../shared/app-info'
import { buildPluginRecoveryViewModel } from './plugin-recovery-view'
import { configureDesktopName, resolveDesktopIdentity } from './app-identity'
import { migrateLegacyUserData } from './app-data-migration'
import { installBundledPluginProfile } from './bundled-plugin-profile'
import { synchronizeBundledESkillOverrides } from './bundled-skill-sync'
import {
  configureBrowserSearchSecurity,
  type BrowserSearchWindow
} from './search/browser-search-controller'
import { isAllowedSearchLocation } from './search/search-engines'
import {
  startLocalSearchRuntime,
  type LocalSearchRuntime
} from './search/local-search-runtime'
import { ResearchCanvasStorage } from './state/research-canvas-storage'
import { initializeFirstLaunchAppearance, registerHomeThemePreferences } from './home-theme-preferences'
import {PowerPreferenceStore, PowerSettingsController} from './power/controller'
import {MacOSLidGuard} from './power/macos-lid-guard'
import {registerPowerSettingsIpc} from './power/ipc'
import { ResearchVoiceController, registerResearchVoiceHandlers } from './state/research-voice'
import { ResearchCanvasClipboard, registerResearchClipboardHandlers } from './state/research-canvas-clipboard'
import { CanvasActionBridge, registerCanvasActionHandlers } from './state/canvas-action-bridge'
import { installNotesService } from './notes/service'
import { NotesStore } from './notes/store'
import { findNoteComponent } from './notes/component-library'
import { NoteNativeMenu } from './notes/native-menu'
import { NoteFiles, noteFileOwnerPrefix } from './notes/files'
import { ResearchContextBridge, readStoredResearchCanvas, readActiveResearchCanvas, registerResearchContextHandlers } from './state/research-context-bridge'
import { ResearchPdfRenderer } from './research/research-pdf'
import {
  assertTrustedMainWindowEvent,
  registerPrivilegedMainWindowHandlers
} from './ipc-trust'
import {
  FileResearchPreviewAuthorizationStorage,
  HarnessWorkspaceFileResolver,
  RESEARCH_PREVIEW_SCHEME,
  ResearchFilePreviewRegistry,
  handleResearchFilePreviewProtocolRequest,
  registerResearchFilePreviewHandlers
} from './state/research-file-preview'
import {
  installResearchCanvasWheelRouter,
  registerResearchCanvasWheelIpc,
  type ResearchCanvasWheelRouter
} from './state/research-canvas-wheel'
import {
  ResearchLinkFrameRegistry,
  registerResearchLinkFrameHandlers
} from './state/research-link-frame'
import { registerResearchWebReaderHandlers } from './state/research-web-reader'
import {createResearchRssService,registerResearchRssHandlers} from './state/research-rss'
import {
  registerResearchCanvasExportHandlers,
  researchCanvasExportFileOperations
} from './state/research-canvas-export'

protocol.registerSchemesAsPrivileged([{
  scheme: RESEARCH_PREVIEW_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}])

type PluginRecoveryAction = 'uninstall' | 'show-log' | 'quit' | 'restart'

const PLUGIN_RECOVERY_ACTIONS = new Set<PluginRecoveryAction>([
  'uninstall',
  'show-log',
  'quit'
])

let accountService: AccountService | undefined
let researchBoardsService: ResearchBoardsService | undefined
let disposeResearchBoardsHandlers: (() => void) | undefined
let mainWindow: BrowserWindow | undefined
let componentDataService: Awaited<ReturnType<typeof createComponentDataService>> | undefined
let noteComponentDataService: Awaited<ReturnType<typeof createComponentDataService>> | undefined
let integrationService: IntegrationService | undefined
let integrationEndpoint: Awaited<ReturnType<typeof startIntegrationBridge>> | undefined
let memoryService: MemoryService | undefined
let memoryEndpoint: Awaited<ReturnType<typeof startMemoryBridge>> | undefined
let stopIntegrationIdentity = () => {}
let runtime: HarnessRuntime
let desktopComputer: ReturnType<typeof createComputerCandidates> | undefined
let localSearchRuntime: LocalSearchRuntime | undefined
let researchBoardIntegration:ResearchBoardIntegration|undefined
let researchClipboardService:ResearchCanvasClipboard|undefined
let researchContextBridge: ResearchContextBridge | undefined
let disposeResearchContextHandlers: (() => void) | undefined
let launchDirectory: string
let flushImageFactoryCanvases: (() => Promise<unknown>) | undefined
let quitting = false
let failureRecoveryVisible = false
let harnessLaunchOperation: Promise<void> | undefined
let pluginRecoveryActionResolver: ((action: PluginRecoveryAction) => void) | undefined
let mainWindowNavigationVersion = 0
let rendererPluginFailureLogs: string[] = []
let pluginRecoveryRemovedPlugins: string[] = []
let pluginRecoveryResetTimer: ReturnType<typeof setTimeout> | undefined
let harnessThemePreferenceSyncTimer: ReturnType<typeof setInterval> | undefined
let researchFilePreviewRegistry: ResearchFilePreviewRegistry | undefined
let researchCanvasWheelRouter: ResearchCanvasWheelRouter | undefined
const researchVoiceController = new ResearchVoiceController({
  getMainWindow: () => mainWindow,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appPath: app.getAppPath(),
  locale: 'zh-CN'
})
const researchLinkFrameRegistry = new ResearchLinkFrameRegistry()

function cancelPluginRecoverySessionReset(): void {
  if (pluginRecoveryResetTimer) clearTimeout(pluginRecoveryResetTimer)
  pluginRecoveryResetTimer = undefined
}

function schedulePluginRecoverySessionReset(): void {
  cancelPluginRecoverySessionReset()
  pluginRecoveryResetTimer = setTimeout(() => {
    pluginRecoveryResetTimer = undefined
    pluginRecoveryRemovedPlugins = []
  // Keep the chain alive long enough for slower Windows machines to finish
  // rendering a frontend plugin failure after the backend reports ready.
  }, 60_000)
}

function appendRendererPluginRecoveryLog(logs: readonly string[]): void {
  if (logs.length === 0) return

  try {
    const evidence = logs
      .slice(-50)
      .join('\n')
      .slice(-20_000)
      .split(/\r?\n/)
      .map((line) => `[renderer] ${line}`)
      .join('\n')
    appendFileSync(
      join(app.getPath('logs'), 'harness.log'),
      `\n[desktop] frontend plugin recovery ${new Date().toISOString()}\n${evidence}\n`,
      'utf8'
    )
  } catch (error) {
    console.warn('[desktop] failed to persist frontend plugin recovery evidence', error)
  }
}

function resolveDesktopChannel(): 'development' | 'legacy' | 'legacy-bridge' | 'notarized' {
  if (!app.isPackaged) return 'development'

  try {
    const metadata = JSON.parse(
      readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')
    ) as { dshDesktopChannel?: unknown }
    if (
      metadata.dshDesktopChannel === 'development' ||
      metadata.dshDesktopChannel === 'notarized' ||
      metadata.dshDesktopChannel === 'legacy-bridge' ||
      metadata.dshDesktopChannel === 'legacy'
    ) {
      return metadata.dshDesktopChannel
    }
    return 'legacy'
  } catch {
    return 'legacy'
  }
}

const desktopChannel = resolveDesktopChannel()
const developmentBuild = desktopChannel === 'development'

function windowsTitleBarOverlay(isDark: boolean): Electron.TitleBarOverlayOptions {
  return {
    color: '#00000000',
    symbolColor: isDark ? '#f3f4f6' : '#202124',
    height: WINDOWS_TITLEBAR_HEIGHT
  }
}

function startHarnessThemePreferenceSync(): void {
  if (harnessThemePreferenceSyncTimer) return
  const sync = (): void => {
    const preference = harnessThemePreference()
    if (nativeTheme.themeSource !== preference) nativeTheme.themeSource = preference
  }
  sync()
  harnessThemePreferenceSyncTimer = setInterval(sync, 250)
  harnessThemePreferenceSyncTimer.unref?.()
}

function stopHarnessThemePreferenceSync(): void {
  if (harnessThemePreferenceSyncTimer) clearInterval(harnessThemePreferenceSyncTimer)
  harnessThemePreferenceSyncTimer = undefined
}

const nativeChromeConfigured = new WeakSet<BrowserWindow>()
function applyWindowChromeTheme(window: BrowserWindow, isDark: boolean): void {
  if (window.isDestroyed()) return
  if (process.platform === 'darwin') {
    // The window constructor already owns the transparent native material.
    // Reapplying vibrancy during renderer theme/DOM updates can rebuild the
    // whole NSVisualEffectView and briefly expose the backing window.
    if (nativeChromeConfigured.has(window)) return
    window.setBackgroundColor('#00000000')
    window.setVibrancy('menu')
    nativeChromeConfigured.add(window)
    return
  }

  window.setBackgroundColor(isDark ? '#141416' : '#ffffff')
  if (process.platform === 'win32') {
    window.setTitleBarOverlay(windowsTitleBarOverlay(isDark))
  }
}

function configureAppIdentity(): () => void {
  // Keep the historical lowercase directory stable across product-name and
  // branding changes. Harness stores workspaces, sessions, credentials, and
  // custom presets below userData, so deriving this path from app.getName()
  // would make an ordinary upgrade look like a fresh installation.
  const explicitAppDataPath = app.commandLine.getSwitchValue('sherlock-app-data-dir').trim()
  if (explicitAppDataPath && !isAbsolute(explicitAppDataPath)) {
    throw new Error('The EWork Odyssey app-data path must be absolute.')
  }
  const appDataPath = explicitAppDataPath ? normalize(explicitAppDataPath) : app.getPath('appData')
  if (explicitAppDataPath) app.setPath('appData', appDataPath)
  const explicitUserDataPath = app.commandLine.getSwitchValue('sherlock-user-data-dir')
  const identity = resolveDesktopIdentity(appDataPath, desktopChannel, explicitUserDataPath)
  configureDesktopName(app, identity.name)
  app.setPath('userData', identity.userData)
  // Resolve the shared lock directory first. Only its owning instance may
  // migrate data or replace plugins and skills used by a running renderer.
  return () => {
    if (
      !explicitUserDataPath &&
      (desktopChannel === 'legacy-bridge' || desktopChannel === 'notarized')
    ) {
      try {
        migrateLegacyUserData(join(appDataPath, 'dsh-desktop'), identity.userData)
      } catch (error) {
        console.warn('[desktop] failed to migrate legacy EWork Odyssey user data', error)
      }
    }
    try {
      initializeFirstLaunchAppearance(identity.userData)
    } catch (error) {
      console.warn('[desktop] failed to initialize first-launch appearance', error)
    }
    if (app.isPackaged) {
      try {
        const agentsHome = resolve(
          process.env.DSH_AGENTS_HOME?.trim() || join(homedir(), '.agents')
        )
        const result = synchronizeBundledESkillOverrides({
          bundledSkillDirectory: join(process.resourcesPath, 'sherlock-skills'),
          overrideSkillDirectories: [
            join(identity.userData, 'harness', 'skills'),
            join(agentsHome, 'skills')
          ]
        })
        for (const upgrade of result.upgraded) {
          console.info(
            `[desktop] upgraded official skill ${upgrade.slug} from ${upgrade.fromVersion} to ${upgrade.toVersion}`
          )
        }
      } catch (error) {
        console.warn('[desktop] failed to synchronize bundled EWork Odyssey skills', error)
      }

      const bundledProfilePath = join(process.resourcesPath, 'sherlock-plugin-profile')
      try {
        const result = installBundledPluginProfile({
          userDataPath: identity.userData,
          bundledProfilePath,
          appVersion: app.getVersion()
        })
        if (result.installed) {
          console.info('[desktop] installed bundled EWork Odyssey plugin profile', result.plugins)
        }
      } catch (error) {
        console.error('[desktop] failed to install bundled EWork Odyssey plugin profile', error)
        throw error
      }
    }
  }
}

async function syncNativeTheme(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return

  // The sidebar already reserves enough room for macOS traffic lights. Read
  // Harness's resolved theme before showing the window so the native surface
  // matches the first rendered frame. The transparent drag strip restores the
  // native window gesture without adding a visual titlebar or covering the
  // traffic lights and right-side header actions.
  const isDark = await window.webContents.executeJavaScript(
    `(() => {
      if (${process.platform === 'darwin'}) {
        let dragRegion = document.getElementById('dsh-desktop-drag-region')
        if (!dragRegion) {
          dragRegion = document.createElement('div')
          dragRegion.id = 'dsh-desktop-drag-region'
          dragRegion.setAttribute('aria-hidden', 'true')
          Object.assign(dragRegion.style, {
            position: 'fixed',
            zIndex: '18',
            top: '0',
            left: '80px',
            right: 'max(220px, var(--dsh-sidebar-width, 0px))',
            height: '24px',
            background: 'transparent',
            pointerEvents: 'auto',
            userSelect: 'none'
          })
          dragRegion.style.setProperty('-webkit-app-region', 'drag')
          document.body.appendChild(dragRegion)
        }
      }
      if (document.body.hasAttribute('data-ds-dark-theme')) return true
      const color = getComputedStyle(document.body).backgroundColor
      const channels = color.match(/[\\d.]+/g)?.slice(0, 3).map(Number)
      if (!channels || channels.length < 3) {
        return matchMedia('(prefers-color-scheme: dark)').matches
      }
      const [red, green, blue] = channels
      return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128
    })()`
  )
  applyWindowChromeTheme(window, isDark)
}

function dshEntryPath(): string {
  if (app.isPackaged) {
    return join(
      process.resourcesPath,
      'app',
      'node_modules',
      '@deepseek-ai',
      'dsh',
      'lib',
      'bin.js'
    )
  }
  return join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

function bundledNodePath(): string {
  const executable = process.platform === 'win32' ? 'node.exe' : 'node'
  return join(app.getAppPath(), 'node_modules', 'node', 'bin', executable)
}

function bundledPnpmEntryPath(): string {
  const root = join(app.getAppPath(), 'node_modules', 'pnpm', 'bin')
  const candidates = [join(root, 'pnpm.cjs'), join(root, 'pnpm.mjs')]
  return candidates.find((candidate) => existsSync(candidate)) ?? join(root, 'pnpm.cjs')
}

function harnessNodeEntryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'harness-node-entry.mjs')
    : join(app.getAppPath(), 'build', 'harness-node-entry.mjs')
}

function desktopResourcePath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'build', name)
}

function bundledSkillDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'sherlock-skills')
    : join(app.getAppPath(), 'skills')
}

function bundledWebSearchEntry(): string {
  return pathToFileURL(
    join(app.getAppPath(), 'node_modules', 'dsh-web-search-session-model', 'index.js')
  ).href
}

function bundledMarketInstallerEntry(): string {
  return pathToFileURL(
    join(app.getAppPath(), 'node_modules', 'dsh-desktop-market-installer', 'index.js')
  ).href
}

function bundledResearchTaskEntry(): string {
  return pathToFileURL(
    join(app.getAppPath(), 'node_modules', 'dsh-research-task-runtime', 'index.js')
  ).href
}

function bundledFundResearchEntry(): string {
  return pathToFileURL(
    join(app.getAppPath(), 'node_modules', 'dsh-fund-research-runtime', 'index.js')
  ).href
}

function desktopIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'app-icon.png')
}

function harnessLocale(): 'en' | 'zh' {
  try {
    const settings = parse(
      readFileSync(join(app.getPath('userData'), 'harness', 'settings.yaml'), 'utf8')
    ) as { locale?: { preference?: unknown } }
    return resolveHarnessLocale(
      settings.locale?.preference,
      app.getPreferredSystemLanguages()
    )
  } catch {
    return resolveHarnessLocale(undefined, app.getPreferredSystemLanguages())
  }
}

function configureApplicationLocale(): void {
  app.commandLine.appendSwitch('lang', harnessLocale() === 'zh' ? 'zh-CN' : 'en-US')
}

function harnessThemePreference(): 'light' | 'dark' | 'system' {
  try {
    const settings = parse(
      readFileSync(join(app.getPath('userData'), 'harness', 'settings.yaml'), 'utf8')
    ) as { 'ui-theme'?: { preference?: unknown } }
    const preference = settings['ui-theme']?.preference
    return preference === 'light' || preference === 'dark' || preference === 'system'
      ? preference
      : 'system'
  } catch {
    return 'system'
  }
}

function isPluginRecoveryPage(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/plugin-recovery.html')
  } catch {
    return false
  }
}

function resolvePluginRecoveryAction(action: PluginRecoveryAction): void {
  const resolve = pluginRecoveryActionResolver
  pluginRecoveryActionResolver = undefined
  resolve?.(action)
}

function installPluginRecoveryNavigation(window: BrowserWindow): void {
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('dsh-recovery://')) return
    event.preventDefault()
    if (!isPluginRecoveryPage(window.webContents.getURL())) return

    try {
      const action = new URL(targetUrl).hostname as PluginRecoveryAction
      if (PLUGIN_RECOVERY_ACTIONS.has(action)) resolvePluginRecoveryAction(action)
    } catch {
      // Ignore malformed recovery actions and keep the current recovery page visible.
    }
  })
}

function createWindow(): BrowserWindow {
  const isMacOS = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 800,
    minHeight: 640,
    show: false,
    title: '',
    icon: desktopIconPath(),
    frame: process.platform !== 'darwin',
    ...(isWindows
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: windowsTitleBarOverlay(nativeTheme.shouldUseDarkColors),
          autoHideMenuBar: true
        }
      : {}),
    ...(isMacOS
      ? {
          acceptFirstMouse: true,
          vibrancy: 'menu' as const,
          visualEffectState: 'active' as const,
          backgroundColor: '#00000000'
        }
      : {
          backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#f8f8f6'
        }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      additionalArguments: [
        developerModeArgument(isDeveloperModeEnabled(app.getPath('userData'))),
        appVersionArgument(app.getVersion())
      ],
      sandbox: true,
      webSecurity: true
    }
  })
  if (process.platform === 'darwin') {
    nativeChromeConfigured.add(window)
    installWindowResize(window)
    window.setWindowButtonVisibility(true)
    window.setWindowButtonPosition({ x: 12, y: 9 })
  } else if (isWindows) {
    window.setMenuBarVisibility(false)
  }
  window.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle('')
  })
  const generationDeliveryLog=createGenerationDeliveryLog(app.getPath('logs'))
  const notesGuideDiagnosticLog=createNotesGuideDiagnosticLog(app.getPath('logs'))
  const homeGuideEntryDiagnosticLog=createHomeGuideEntryDiagnosticLog(app.getPath('logs'))
  window.webContents.on('console-message', (details) => {
    if(details.level==='info'&&details.message.startsWith(HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX))recordHomeGuideEntryConsoleMessage(homeGuideEntryDiagnosticLog,details,isTrustedMainWindowEvent({sender:window.webContents,senderFrame:details.frame},window))
    if(details.level==='info'&&details.message.startsWith(NOTES_GUIDE_DIAGNOSTIC_PREFIX))recordNotesGuideConsoleMessage(notesGuideDiagnosticLog,details,isTrustedMainWindowEvent({sender:window.webContents,senderFrame:details.frame},window))
    if(details.level==='info'&&details.message.startsWith(GENERATION_DELIVERY_PREFIX)&&isTrustedMainWindowEvent({sender:window.webContents,senderFrame:details.frame},window))generationDeliveryLog.write(details.message)
    if (details.level !== 'error') return
    const sourceUrl = details.sourceId || window.webContents.getURL()
    if (!sourceUrl.startsWith('http://127.0.0.1:')) return
    const message = details.message.trim()
    if (!message) return
    rendererPluginFailureLogs.push(`[stderr] ${message}`)
    rendererPluginFailureLogs = rendererPluginFailureLogs.slice(-50)
  })
  installPluginRecoveryNavigation(window)
  secureWindow(window, {
    openWebLink:url=>{void openClientLink(window,url).catch(()=>{})},
    youtubeAppId: app.isPackaged ? desktopChannel === 'notarized' ? 'com.evanarts.sherlock' : developmentBuild ? 'io.dsh.desktop.dev' : 'io.dsh.desktop' : undefined,
    allowsResearchFrameUrl: (url) => researchLinkFrameRegistry.allows(url),
    ownsResearchFrame: (frame) => researchLinkFrameRegistry.ownsFrame(frame),
    researchFrameUrl: (frame) => researchLinkFrameRegistry.authorizedFrameUrl(frame)
  })
  const canvasWheelRouter = installResearchCanvasWheelRouter(window)
  researchCanvasWheelRouter = canvasWheelRouter
  installContextMenu(window, harnessLocale, (sessionId) => new HarnessWorkspaceFileResolver(join(app.getPath('userData'), 'harness')).resolveRoot(sessionId))
  window.on('closed', () => {
    canvasWheelRouter.dispose()
    if (researchCanvasWheelRouter === canvasWheelRouter) researchCanvasWheelRouter = undefined
    if (mainWindow === window) mainWindow = undefined
    resolvePluginRecoveryAction('quit')
  })
  mainWindow = window
  researchVoiceController.attachWindow(window)
  return window
}

function createLocalSearchWindow(
  options: BrowserWindowConstructorOptions
): BrowserSearchWindow {
  const window = new BrowserWindow(options)
  const owner = mainWindow
  const closeWithOwner = (): void => {
    if (!window.isDestroyed()) window.destroy()
  }
  owner?.once('closed', closeWithOwner)
  window.once('closed', () => {
    owner?.removeListener('closed', closeWithOwner)
  })
  const partition = options.webPreferences?.partition
  if (!partition) throw new Error('Local search browser requires an isolated partition.')
  configureBrowserSearchSecurity(window, session.fromPartition(partition))
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (
      isAllowedSearchLocation('bing', url) ||
      isAllowedSearchLocation('duckduckgo', url)
    ) {
      return
    }
    event.preventDefault()
  })
  return window
}

async function openHarness(url: string): Promise<void> {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow()
  if (shouldLoadHarnessUrl(window.webContents.getURL(), url)) {
    const navigationVersion = ++mainWindowNavigationVersion
    rendererPluginFailureLogs = []
    window.webContents.stop()
    try {
      await window.loadURL(url)
    } catch (error) {
      if (navigationVersion !== mainWindowNavigationVersion) return
      if (isAbortedNavigationError(error)) return
      const snapshot = runtime.snapshot()
      if (snapshot.phase !== 'ready' || snapshot.url !== url) return
      throw error
    }
    if (navigationVersion !== mainWindowNavigationVersion) return
  }
  if (runtime.snapshot().url !== url || window.isDestroyed()) return
  await syncNativeTheme(window)
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

async function showSplash(): Promise<void> {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow()
  const navigationVersion = ++mainWindowNavigationVersion
  window.webContents.stop()
  await window.loadFile(desktopResourcePath('splash.html'))
  if (window.isDestroyed() || navigationVersion !== mainWindowNavigationVersion) return
  window.show()
  window.focus()
}

function launchHarness(): Promise<void> {
  if (harnessLaunchOperation) return harnessLaunchOperation

  harnessLaunchOperation = (async () => {
    await showSplash()
    await runtime.start(launchDirectory)
  })().finally(() => {
    harnessLaunchOperation = undefined
  })
  return harnessLaunchOperation
}

function restartHarness(): Promise<void> {
  if (failureRecoveryVisible) resolvePluginRecoveryAction('restart')
  return launchHarness()
}

let scheduledRunner: TaskRunner | undefined

let flushResearchNativeWeb:(()=>Promise<void>)|undefined
function registerHarnessHandlers(researchCanvasStorage: ResearchCanvasStorage): void {
  registerHomeThemePreferences(ipcMain, () => mainWindow, app.getPath('userData'))
  ipcMain.removeHandler('harness:restart')
  ipcMain.handle('harness:restart', async (event) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    if (runtime.snapshot().phase !== 'ready') {
      throw new Error('Harness is not ready to restart.')
    }

    await restartHarness()
    return { ok: runtime.snapshot().phase === 'ready' }
  })

  ipcMain.removeHandler('desktop-menu:execute')
  ipcMain.handle('desktop-menu:execute', async (event, command: unknown) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    if (!isDesktopMenuCommand(command)) {
      throw new Error('Unknown EWork Odyssey menu command.')
    }
    await executeDesktopMenuCommand(command)
    return { ok: true }
  })

  ipcMain.removeHandler('desktop-scrollbars:always-show')
  ipcMain.handle('desktop-scrollbars:always-show', event => {
    assertTrustedMainWindowEvent(event, mainWindow)
    return process.platform === 'darwin' && systemPreferences.getUserDefault('AppleShowScrollBars', 'string') === 'Always'
  })

  ipcMain.removeHandler('desktop-titlebar:set-theme')
  ipcMain.handle('desktop-titlebar:set-theme', (event, isDark: unknown) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    if (typeof isDark !== 'boolean') {
      throw new Error('The EWork Odyssey titlebar theme must be a boolean.')
    }
    if (
      (process.platform === 'win32' || process.platform === 'darwin') &&
      mainWindow
    ) {
      applyWindowChromeTheme(mainWindow, isDark)
    }
    return { ok: true }
  })

  registerDeliveryFileClipboard({ipcMain,getMainWindow:()=>mainWindow,writeText:value=>clipboard.writeText(value)})
  registerImageActions(() => mainWindow)
  registerPrivilegedMainWindowHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    showHarnessLog: () => {
      shell.showItemInFolder(join(app.getPath('logs'), 'harness.log'))
    },
    openDirectory: async () => {
      const window = mainWindow
      if (!window) throw new Error('The main EWork Odyssey window is unavailable.')
      const result = await dialog.showOpenDialog(window, {
        title: harnessLocale() === 'zh' ? '选择工作区目录' : 'Select Workspace Directory',
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    showItemInFolder: (path: unknown) => {
      if (typeof path !== 'string' || !isAbsolute(path) || !existsSync(path)) {
        throw new Error('Finder reveal requires an existing absolute filesystem path.')
      }
      shell.showItemInFolder(path)
      return { ok: true }
    },
    researchFilesAvailable: async (paths: unknown) => {
      const rejected = Array.isArray(paths)
        ? Array.from({ length: Math.min(paths.length, 64) }, () => false)
        : []
      const values = Array.isArray(paths) ? Array.from(paths) : []
      if (
        !Array.isArray(paths) ||
        values.length > 64 ||
        values.some((path) =>
          typeof path !== 'string' || path.length === 0 || path.length > 512
        )
      ) {
        return rejected
      }
      return Promise.all(values.map((path) =>
        stat(path).then((value) => value.isFile()).catch(() => false)
      ))
    },
    researchCanvasStorageGet: (key: unknown) => researchBoardsService
      ? researchBoardsService.readCanvasStorage(key)
      : researchCanvasStorage.getItem(key),
    researchCanvasStorageSet: (key: unknown, value: unknown) =>
      researchBoardsService
        ? researchBoardsService.writeCanvasStorage(key, value)
        : researchCanvasStorage.setItem(key, value),
    onStorageReadRejected: (error) =>
      console.warn('[research-canvas] rejected storage read', error),
    onStorageWriteRejected: (error) =>
      console.warn('[research-canvas] rejected storage write', error)
  })
  if (!researchFilePreviewRegistry) {
    throw new Error('Research preview registry is unavailable.')
  }
  registerResearchFilePreviewHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    registry: researchFilePreviewRegistry,
    importFinder: async (value) => {
      const input = value as { path?: unknown; sessionId?: unknown; nodeId?: unknown }
      if (!input || typeof input.path !== 'string' || typeof input.sessionId !== 'string' || typeof input.nodeId !== 'string') return null
      if (researchBoardsService?.isSharedSession(input.sessionId)) return researchFilePreviewRegistry!.admitFinder(value, true)
      const favorite = researchBoardsService?.getSnapshot().favorites.find(f => f.sessionId === input.sessionId)
      const directory = favorite?.cwd ?? await new HarnessWorkspaceFileResolver(join(app.getPath('userData'), 'harness')).resolveRoot(input.sessionId)
      if (!directory) throw Error('画板目录尚未就绪，请稍后重试')
      const path = await copyResearchFile(input.path, directory)
      const descriptor = await researchFilePreviewRegistry!.admitFinder({ ...input, path }, true)
      if (!descriptor) throw Error('文件已复制，但暂时无法添加到画板，请重试')
      return { ...descriptor, path }
    }
  })
  registerResearchClipboardHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    service: researchClipboardService = new ResearchCanvasClipboard({
      userDataPath: app.getPath('userData'), clipboard,
      registry: researchFilePreviewRegistry,
      revealFile: (target) => shell.showItemInFolder(target)
    })
  })
  registerResearchVoiceHandlers({ ipcMain, getMainWindow: () => mainWindow, controller: researchVoiceController })
  registerResearchCanvasWheelIpc({
    ipcMain,
    getMainWindow: () => mainWindow,
    getRouter: () => researchCanvasWheelRouter,
    onRejected: (error) => console.warn('[research-canvas] rejected wheel region update', error)
  })
  guardUnexpectedErrorDownloads(session.defaultSession)
  const nativeResearchWeb = registerResearchNativeWeb({ipcMain,getMainWindow:()=>mainWindow,registry:researchLinkFrameRegistry,locale:harnessLocale,navigation:new ResearchWebNavigationStore(join(app.getPath('userData'),'research-web-navigation.bin'),safeStorage),browserSession:new ResearchWebSessionPersistence(session.fromPartition('persist:research-web-pages'),join(app.getPath('userData'),'research-web-session-cookies.bin'),safeStorage)})
  flushResearchNativeWeb=()=>nativeResearchWeb.flush()
  const nativeResearchYoutube = registerResearchYoutubeNative({ipcMain,getMainWindow:()=>mainWindow,registry:researchLinkFrameRegistry,appId:desktopChannel==='notarized'?'com.evanarts.sherlock':developmentBuild?'io.dsh.desktop.dev':'io.dsh.desktop'})
  registerCanvasUseWeb({ipcMain,getMainWindow:()=>mainWindow,registry:researchLinkFrameRegistry,native:nativeResearchWeb.contents,authorize:(id,write)=>{if(!researchBoardsService)throw Error('画板服务尚未就绪');researchBoardsService.authorizeCanvasUse(id,write)}})
  registerResearchLinkFrameHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    registry: researchLinkFrameRegistry,
    inspectNative: nativeResearchWeb.inspect,
    releaseNative: (identity) => { nativeResearchWeb.release(identity);nativeResearchYoutube.release(identity) }
  })
  registerResearchWebReaderHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    registry: researchLinkFrameRegistry,
    dependencies: {
      fetch: (input, init) => net.fetch(input, init),
      createTimeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds)
    }
  })
  const exportFileOperations = researchCanvasExportFileOperations()
  registerResearchCanvasExportHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    dependencies: {
      showSaveDialog: async (options) => {
        const window = mainWindow
        return !window || window.isDestroyed()
          ? { canceled: true }
          : dialog.showSaveDialog(window, options as SaveDialogOptions)
      },
      writeFile: exportFileOperations.writeFile,
      copyFile: exportFileOperations.copyFile,
      fetchOriginal: (url, options) => net.fetch(url, options),
      resolveExportSource: (value) => researchFilePreviewRegistry!.resolveExportSource(value)
    }
  })
}

async function executeDesktopMenuCommand(command: DesktopMenuCommand): Promise<void> {
  const window = mainWindow
  if (!window || window.isDestroyed()) return
  const contents = window.webContents

  switch (command) {
    case 'restart-harness':
      await restartHarness()
      break
    case 'show-harness-log':
      shell.showItemInFolder(join(app.getPath('logs'), 'harness.log'))
      break
    case 'check-for-updates':
      await checkForUpdates(true)
      break
    case 'undo':
      contents.undo()
      break
    case 'redo':
      contents.redo()
      break
    case 'cut':
      contents.cut()
      break
    case 'copy':
      contents.copy()
      break
    case 'paste':
      contents.paste()
      break
    case 'select-all':
      contents.selectAll()
      break
    case 'reload':
      contents.reload()
      break
    case 'toggle-devtools':
      contents.toggleDevTools()
      break
    case 'zoom-reset':
      contents.setZoomLevel(0)
      break
    case 'zoom-in':
      contents.setZoomLevel(Math.min(3, contents.getZoomLevel() + 0.5))
      break
    case 'zoom-out':
      contents.setZoomLevel(Math.max(-3, contents.getZoomLevel() - 0.5))
      break
    case 'toggle-fullscreen':
      window.setFullScreen(!window.isFullScreen())
      break
    case 'about':
      await dialog.showMessageBox(window, {
        type: 'info',
        title: 'EWork Odyssey',
        message: `EWork Odyssey ${app.getVersion()}`,
        detail: 'A local-first desktop knowledge assistant.',
        buttons: ['OK'],
        noLink: true
      })
      break
    case 'quit':
      app.quit()
      break
  }
}

async function waitForPluginRecoveryAction(options: {
  snapshot: RuntimeSnapshot
  plugins: readonly string[]
  removedPlugins: readonly string[]
  notice?: string
}): Promise<PluginRecoveryAction> {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow()
  const state = buildPluginRecoveryViewModel({
    ...options,
    locale: harnessLocale()
  })
  const actionPromise = new Promise<PluginRecoveryAction>((resolve) => {
    pluginRecoveryActionResolver = resolve
  })
  const navigationVersion = ++mainWindowNavigationVersion
  window.webContents.stop()

  try {
    await window.loadFile(desktopResourcePath('plugin-recovery.html'), {
      query: {
        state: JSON.stringify(state),
        icon: app.isPackaged ? 'icon.png' : 'app-icon.png',
        theme: harnessThemePreference()
      }
    })
  } catch (error) {
    pluginRecoveryActionResolver = undefined
    throw error
  }

  if (window.isDestroyed() || navigationVersion !== mainWindowNavigationVersion) return 'quit'
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return actionPromise
}

function showUnexpectedError(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  dialog.showErrorBox('EWork Odyssey encountered an error', message)
}

async function showPluginRecovery(options?: {
  message?: string
  logs?: readonly string[]
}): Promise<void> {
  if (failureRecoveryVisible || quitting) return
  failureRecoveryVisible = true

  const dshHome = join(app.getPath('userData'), 'harness')
  const isChinese = harnessLocale() === 'zh'
  cancelPluginRecoverySessionReset()
  const removedPlugins = pluginRecoveryRemovedPlugins
  let notice: string | undefined

  try {
    while (!quitting) {
      let snapshot = runtime.snapshot()
      const logs = options?.logs ?? snapshot.logs
      const message = options?.message ?? snapshot.message
      const offendingPlugins = await resolveProfileRecoveryPlugins(
        dshHome,
        extractPluginFailureReferences(logs),
        extractDuplicateLoaderEntryId(logs),
        extractSlotConflictName(logs),
        removedPlugins
      )
      const action = await waitForPluginRecoveryAction({
        snapshot: {
          ...snapshot,
          message: message || snapshot.message
        },
        plugins: offendingPlugins,
        removedPlugins,
        notice
      })
      notice = undefined

      if (action === 'uninstall' && offendingPlugins.length > 0) {
        const failedPlugins: string[] = []
        for (const plugin of offendingPlugins) {
          const removed = await uninstallPluginFromProfile(dshHome, plugin, async (pluginName) => {
            const result = await removeProfilePluginWithDsh(
              {
                dshHome,
                dshEntryPath: dshEntryPath(),
                nodeExecutablePath: bundledNodePath(),
                pnpmEntryPath: bundledPnpmEntryPath(),
                environment: process.env
              },
              pluginName
            )
            if (!result.ok) {
              console.warn(
                `[plugin-recovery] Failed to remove ${pluginName}: ${result.detail ?? 'unknown error'}`
              )
            }
            return result.ok
          })
          if (removed) {
            if (!removedPlugins.includes(plugin)) removedPlugins.push(plugin)
          } else {
            failedPlugins.push(plugin)
          }
        }

        if (failedPlugins.length === offendingPlugins.length) {
          notice = isChinese
            ? '未能修改插件配置。请打开 Harness 日志查看详情，或选择其他恢复方式。'
            : 'The plugin profile could not be updated. Open the Harness log for details or choose another recovery option.'
          continue
        }
        if (failedPlugins.length > 0) {
          notice = isChinese
            ? `以下插件未能移除：${failedPlugins.join('、')}`
            : `These plugins could not be removed: ${failedPlugins.join(', ')}`
        }
        await launchHarness()
        if (runtime.snapshot().phase === 'ready') {
          schedulePluginRecoverySessionReset()
          return
        }
        continue
      } else if (action === 'restart') {
        await launchHarness()
        if (runtime.snapshot().phase === 'ready') {
          schedulePluginRecoverySessionReset()
          return
        }
        continue
      } else if (action === 'show-log') {
        shell.showItemInFolder(join(app.getPath('logs'), 'harness.log'))
        continue
      } else {
        app.quit()
        return
      }
    }
  } catch (error) {
    showUnexpectedError(error)
  } finally {
    failureRecoveryVisible = false
  }
}

async function showRuntimeFailure(snapshot: RuntimeSnapshot): Promise<void> {
  await showPluginRecovery({ message: snapshot.message, logs: snapshot.logs })
}

function installMenu(): void {
  const isChinese = app.getLocale().toLowerCase().startsWith('zh')
  const checkForUpdatesLabel = isChinese
    ? '检查更新…'
    : 'Check for Updates…'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              {
                label: checkForUpdatesLabel,
                accelerator: 'CmdOrCtrl+U',
                click: () => void checkForUpdates(true).catch(showUnexpectedError)
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'Harness',
      submenu: [
        {
          label: isChinese ? '重启 Harness' : 'Restart Harness',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => void restartHarness().catch(showUnexpectedError)
        },
        {
          label: isChinese ? '查看 Harness 日志' : 'Show Harness Log',
          click: () => shell.showItemInFolder(join(app.getPath('logs'), 'harness.log'))
        },
        ...(process.platform === 'darwin'
          ? []
          : [
              { type: 'separator' as const },
              {
                label: checkForUpdatesLabel,
                accelerator: 'CmdOrCtrl+U',
                click: () => void checkForUpdates(true).catch(showUnexpectedError)
              }
            ]),
        ...(process.platform === 'darwin'
          ? []
          : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(false)
  }
}

async function bootstrap(): Promise<void> {
  if (process.platform === 'darwin') app.dock?.setIcon(desktopIconPath())
  if (process.platform === 'darwin') {
    const powerStore = new PowerPreferenceStore(app.getPath('userData'))
    const powerSettings = new PowerSettingsController({store: powerStore, blocker: powerSaveBlocker, guard: new MacOSLidGuard({helperSource: app.isPackaged ? join(process.resourcesPath, 'native', 'sherlock-power-helper') : join(app.getAppPath(), 'build/native/sherlock-power-helper'), onDiagnostic: value => powerStore.recordDiagnostic(value)}), canPreventSleep: () => !['serious', 'critical'].includes(powerMonitor.getCurrentThermalState())})
    registerPowerSettingsIpc(ipcMain, () => mainWindow, powerSettings)
    void powerSettings.initialize().catch(error => console.warn('[power-settings] unable to restore saved preference', error))
    const thermalChanged = ({state}: {state: string}) => {
      if (state === 'serious' || state === 'critical') void powerSettings.safetyStop()
    }
    powerMonitor.on('thermal-state-change', thermalChanged)
    thermalChanged({state: powerMonitor.getCurrentThermalState()})
    const powerPoll = setInterval(() => {void powerSettings.refresh().catch(error => console.warn('[power-settings]', error))}, 5000)
    powerPoll.unref()
    app.once('before-quit', () => {clearInterval(powerPoll); powerMonitor.removeListener('thermal-state-change', thermalChanged); powerSettings.dispose()})
  }
  launchDirectory = await ensureLaunchRoot(app.getPath('userData'))
  const acceptanceOrigin = localAcceptanceOrigin({
    origin: app.commandLine.getSwitchValue('sherlock-local-acceptance-origin'),
    userData: app.commandLine.getSwitchValue('sherlock-user-data-dir'),
    appData: app.commandLine.getSwitchValue('sherlock-app-data-dir')
  }, tmpdir())
  await initializeLocalUpdateChecks({
    acceptanceOrigin,
    feed: app.commandLine.getSwitchValue('sherlock-local-update-feed'),
    feedRequested: app.commandLine.hasSwitch('sherlock-local-update-feed'),
    downloadRequested: app.commandLine.hasSwitch('sherlock-local-update-download'),
    userData: app.getPath('userData'),
    appData: app.getPath('appData')
  }, tmpdir())
  registerUpdateHandlers(() => mainWindow)
  setUpdateRestartPreparation(() => prepareUpdateRestart(mainWindow, ipcMain, async () => {
    if (!researchBoardsService) throw Error('研究服务尚未就绪，应用尚未退出。')
    await researchBoardsService.prepareForUpdateRestart()
  }))
  if (process.platform === 'darwin') startHarnessThemePreferenceSync()
  const dshHome = join(app.getPath('userData'), 'harness')
  researchFilePreviewRegistry = new ResearchFilePreviewRegistry({
    canReadAuthorization:record=>!record.sessionId.startsWith('note-files:')||record.sessionId.startsWith(noteFileOwnerPrefix(accountService?.authenticated?accountService.accountId||'local':'local')),
    storage: new FileResearchPreviewAuthorizationStorage(app.getPath('userData')),
    workspaceResolver: new HarnessWorkspaceFileResolver(dshHome)
  })
  const homeGuideAssets = createHomeGuideAssetService({
    registry: researchFilePreviewRegistry,
    companyPresentationPath: app.isPackaged ? join(process.resourcesPath, 'sherlock-skills/efund-ppt-maker/assets/efund-ework-onepage.pptx') : join(app.getAppPath(), 'skills/efund-ppt-maker/assets/efund-ework-onepage.pptx')
  })
  registerHomeGuideAssetHandlers({ ipcMain, getMainWindow: () => mainWindow, service: homeGuideAssets })
  app.once('before-quit', () => homeGuideAssets.dispose())
  let knowledgeFilePreview: KnowledgeFilePreview | undefined
  registerPptxEditorHandlers({ ipcMain, getMainWindow: () => mainWindow, service: new PptxEditorService({
    resolveWorkspace: id => new HarnessWorkspaceFileResolver(dshHome).resolveRoot(id),
    resolveCapability: url => knowledgeFilePreview?.registry.ownsUrl(url)
      ? knowledgeFilePreview.resolveCapability(url) : homeGuideAssets.resolveEditableCapability(url),
    resolveEditIdentity: identity => identity.sessionId.startsWith('knowledge-preview:')
      ? knowledgeFilePreview?.editSource(identity) ?? Promise.resolve(null) : homeGuideAssets.resolveEditableIdentity(identity),
    refreshPreview: async identity => {
      const registry = identity.sessionId.startsWith('knowledge-preview:')
        ? knowledgeFilePreview?.registry : researchFilePreviewRegistry
      return (await registry?.restore(identity))?.url ?? null
    },
    commitManaged: async (identity, path, version, bytes) => identity.sessionId.startsWith('knowledge-preview:')
      ? knowledgeFilePreview?.savePresentation(identity, path, version, bytes) ?? false : undefined
  }) })
  const researchCanvasStorage = new ResearchCanvasStorage(app.getPath('userData'))
  const canvasActions = new CanvasActionBridge({
    send: value => { if(!mainWindow || mainWindow.isDestroyed())throw Error('画板窗口不可用'); mainWindow.webContents.send('research:canvas-actions:request',value) },
    canRead: sessionId => { try { if(researchBoardsService?.isSharedSession(sessionId))researchBoardsService.readSharedCanvas(sessionId);return true }catch{return false} }
  })
  const disposeCanvasActions = registerCanvasActionHandlers({ipcMain,getMainWindow:()=>mainWindow,bridge:canvasActions})
  app.once('before-quit',disposeCanvasActions)
  const noteComponentActions = new CanvasActionBridge({
    send:value=>{if(!mainWindow||mainWindow.isDestroyed())throw Error('笔记窗口不可用。');mainWindow.webContents.send('notes:component-data-action',{...(value as object),owner:integrationOwner()||'local'})},
    canRead:sessionId=>canReadNoteSession(sessionId)
  })
  app.once('before-quit',()=>noteComponentActions.dispose())
  const rssService=createResearchRssService({canvas:canvasActions,isShared:id=>researchBoardsService?.isSharedSession(id)===true})
  app.once('before-quit',registerResearchRssHandlers({ipcMain,getMainWindow:()=>mainWindow,service:rssService}))
  let isScheduledSession = (_id: string) => false
  let scheduledTaskRequest = (_value: unknown): Promise<unknown> => Promise.reject(Error('定时任务服务未就绪。'))
  const notifiedSessionTurns = new Map<string, number>()
  const clientWindowAction=async(action:string,args:any)=>{
    if(!mainWindow||mainWindow.isDestroyed())throw Error('客户端窗口不可用。')
    if(action==='fullscreen'){if(mainWindow.isFullScreen()!==args.enabled){await executeDesktopMenuCommand('toggle-fullscreen');const until=Date.now()+4000;while(mainWindow&&!mainWindow.isDestroyed()&&mainWindow.isFullScreen()!==args.enabled&&Date.now()<until)await new Promise(r=>setTimeout(r,20));if(!mainWindow||mainWindow.isDestroyed()||mainWindow.isFullScreen()!==args.enabled)throw Error('全屏状态尚未确认。')}}
    else if(['zoom-reset','zoom-in','zoom-out'].includes(action))await executeDesktopMenuCommand(action as any)
    else throw Error('不支持的窗口操作。')
    return{zoomLevel:mainWindow.webContents.getZoomLevel(),fullscreen:mainWindow.isFullScreen()}
  }
  let notesDocumentAdapter:import('./notes/document-capability-adapter').NoteDocumentAdapter|undefined
  let conversationComponentsService:ReturnType<typeof createConversationComponentService>|undefined
  let conversationComponentsReady=false
  const integrationOwner = () => accountService!.authenticated ? accountService!.accountId : 'local'
  const knowledgeIdentity = () => ({ owner: integrationOwner() || 'local', generation: accountService!.generation })
  let historyScanChangeTimer: ReturnType<typeof setTimeout> | undefined
  let historyScanInProgress = false
  const sendKnowledgeChange = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('knowledge:changed')
  }
  const knowledge = new KnowledgeStore(join(app.getPath('userData'), 'knowledge-library'), knowledgeIdentity, () => {
    if (!historyScanInProgress) { sendKnowledgeChange(); return }
    historyScanChangeTimer ??= setTimeout(() => {
      historyScanChangeTimer = undefined
      sendKnowledgeChange()
    }, 150)
  })
  const factoryCanvases = new ImageFactoryCanvases(join(app.getPath('userData'), 'image-factory-canvases'), () => {
    const owner = integrationOwner()
    if (!owner) throw Error('账号正在读取，请重新打开图像工厂。')
    return { owner, generation: accountService!.generation }
  })
  flushImageFactoryCanvases = () => factoryCanvases.drain()
  registerTrustedMainWindowHandler(ipcMain, 'image-factory:canvas-read', () => mainWindow, (_event, scope: CanvasScope) =>
    factoryCanvases.read(scope))
  registerTrustedMainWindowHandler(ipcMain, 'image-factory:canvas-write', () => mainWindow, (_event, value: CanvasWrite) =>
    factoryCanvases.write(value))
  registerTrustedMainWindowHandler(ipcMain, 'image-factory:canvas-adopt', () => mainWindow, (_event, sessionId: string, epoch: number) =>
    factoryCanvases.adopt(sessionId, epoch))
  registerTrustedMainWindowHandler(ipcMain, 'image-factory:archive', () => mainWindow, (_event, value: unknown) => {
    const input = value as { id?: string; sessionId?: string; sessionTitle?: unknown; epoch?: number; name?: string; data?: Uint8Array } | undefined
    if (typeof input?.id !== 'string' || typeof input.sessionId !== 'string' || typeof input.name !== 'string' ||
        input.epoch !== knowledgeIdentity().generation || input.name.length > 100 || !(input.data instanceof Uint8Array) || input.data.byteLength > 36 * 1024 * 1024) {
      throw Error('生成图片的知识库参数无效。')
    }
    const sessionTitle = typeof input.sessionTitle === 'string' ? input.sessionTitle.trim().slice(0, 256) || undefined : undefined
    return knowledge.collectFactoryImage(Buffer.from(input.data), {
      id: input.id, sessionId: input.sessionId, sessionTitle, name: input.name, processed: true
    })
  })
  let historyScan: Promise<unknown> | undefined
  let rescanAll = false
  let knowledgeHistoryTimer: ReturnType<typeof setTimeout> | undefined
  const scanPendingSessions = new Set<string>()
  const queueKnowledgeHistory = (sessionId?: string) => {
    if (sessionId) scanPendingSessions.add(sessionId)
    else rescanAll = true
    if (historyScan || knowledgeHistoryTimer) return
    // Let the host flush the completed turn before reading the durable log.
    knowledgeHistoryTimer = setTimeout(() => {
      knowledgeHistoryTimer = undefined
      const snapshot = runtime?.snapshot()
      if (snapshot?.phase !== 'ready' || (accountService?.authenticated && !accountService.accountId)) return
      const { owner, generation } = knowledgeIdentity()
      const only = rescanAll ? undefined : new Set(scanPendingSessions)
      rescanAll = false
      scanPendingSessions.clear()
      const check = () => {
        const current = knowledgeIdentity()
        if (current.owner !== owner || current.generation !== generation || runtime?.snapshot().url !== snapshot.url) {
          throw Error('Knowledge history scan context changed')
        }
      }
      historyScanInProgress = true
      historyScan = scanKnowledgeHistory({ sessionRoot: join(dshHome, 'sessions'), attachmentsRoot: join(dshHome, 'attachments', 'v1', 'objects'), store: knowledge, only, check,
        allowSession: id => !researchBoardsService?.isSharedSession(id) && !isScheduledSession(id)
      }).then(result => {
        if (!only || result.failed) console.info('[knowledge] historical file collection', result)
      }).catch(error => {
        try { check() } catch { return }
        console.warn('[knowledge] historical file collection failed', error)
      }).finally(() => {
        historyScanInProgress = false
        historyScan = undefined
        if (rescanAll || scanPendingSessions.size) queueKnowledgeHistory(scanPendingSessions.values().next().value)
      })
    }, sessionId ? 1200 : 0)
  }
  app.once('before-quit', () => {
    clearTimeout(knowledgeHistoryTimer)
    clearTimeout(historyScanChangeTimer)
  })
  let knowledgeShared: KnowledgeSharing
  const knowledgeContent = new KnowledgeContent(() => researchPdfModules({
    packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath()
  }))
  const knowledgeView = new KnowledgeViewBridge(value => {
    if (!mainWindow || mainWindow.isDestroyed()) throw Error('知识库工作区不可用。')
    mainWindow.webContents.send('knowledge:view-action', value)
  })
  registerTrustedMainWindowHandler(ipcMain, 'knowledge:view-reply', () => mainWindow, (_event, value) => knowledgeView.reply(value))
  const canWriteSpreadsheet=(sessionId:string)=>{try{researchBoardsService?.authorizeCanvasUse(sessionId,true);return true}catch{return false}}
  const spreadsheet:ReturnType<typeof installSpreadsheet>=installSpreadsheet({ipcMain,getWindow:()=>mainWindow,visible:()=>clientCapabilities.currentVisibleContext(),canWrite:canWriteSpreadsheet,dataPath:app.getPath('userData'),locale:harnessLocale,library:()=>noteComponentLibrary,runtimeUrl:()=>runtime?.snapshot().url,canPlayCashFlowGuide:({owner,sessionId})=>{
    const scope=owner==='local'?'local':'account:'+owner
    const raw=researchCanvasStorage.peekItem('sherlock.home-guide.sessions.v1:'+encodeURIComponent(scope))
    return !!raw&&JSON.parse(raw).entries.some((entry:{sessionId:string;kind:string})=>entry.sessionId===sessionId&&entry.kind==='spreadsheet')
  }})
  const clientCapabilities:ClientCapabilityService=new ClientCapabilityService({spreadsheet,sharedKnowledge:(current,id)=>!accountService?.authenticated||researchBoardsService?.isSharedSession(id)?{}:sharedKnowledgeCapabilityHandlers(knowledgeShared,knowledgeContent,current),knowledge:(current,id)=>researchBoardsService?.isSharedSession(id)?{}:knowledgeCapabilityHandlers(knowledge,knowledgeShared,knowledgeContent,knowledgeView,current),get conversationComponents(){return conversationComponentsReady?conversationComponentsService:undefined},notes:()=>notesDocumentAdapter,owner:()=>integrationOwner()||'local',windowIdentity:()=>mainWindow,canWrite:canWriteSpreadsheet,canRead:sessionId=>{try{if(researchBoardsService?.isSharedSession(sessionId))researchBoardsService.readSharedCanvas(sessionId);return true}catch{return false}},scheduled:id=>isScheduledSession(id),send:value=>{if(!mainWindow||mainWindow.isDestroyed())throw Error('客户端窗口不可用。');mainWindow.webContents.send('client-capabilities:navigate',value)},canvasAvailable:id=>canvasActions.isAvailable(id),canvas:(sessionId,method,args,signal)=>canvasActions.execute({sessionId,method,args},signal),window:clientWindowAction})
  app.once('before-quit',installClientCapabilityBinding({ipcMain,getWindow:()=>mainWindow,service:clientCapabilities}))

  const researchPdfRenderer = new ResearchPdfRenderer()
  app.once('before-quit', () => researchPdfRenderer.dispose())
  researchContextBridge = new ResearchContextBridge({
    researchPdf: (html, signal) => researchPdfRenderer.render(html, signal),
    scheduledTask: value => scheduledTaskRequest(value),
    clientCapability:(value,signal)=>clientCapabilities.request(value,signal),
    sessionCompleted: ({ sessionId, seq, title, preview }) => {
      if (isScheduledSession(sessionId) || seq <= (notifiedSessionTurns.get(sessionId) ?? -1)) return
      queueKnowledgeHistory(sessionId)
      notifiedSessionTurns.delete(sessionId)
      notifiedSessionTurns.set(sessionId, seq)
      if (notifiedSessionTurns.size > 1000) notifiedSessionTurns.delete(notifiedSessionTurns.keys().next().value!)
      try {
        if (!Notification.isSupported()) return
        const english = harnessLocale() === 'en'
        const notification = new Notification({
          title: title || (english ? 'Session task completed' : '会话任务已完成'),
          body: preview || (english ? 'Task completed. Open EWork Odyssey to view the result.' : '任务已完成，打开 EWork Odyssey 查看结果。')
        })
        notification.on('click', () => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        })
        notification.show()
      } catch (error) { console.warn('[session-notification] unable to show notification', error) }
    },
    canvasAction: (value:any,signal) => value?.method==='data' ? componentDataService ? componentDataService.request(value.sessionId,value.args) : Promise.reject(Error('数据刷新服务不可用')) : canvasActions.execute(value,signal),
    isSharedSession:id=>researchBoardsService?.isSharedSession(id)===true,
    additionalSources:id=>researchBoardIntegration?.personalContext(id)??[],
    readCanvas: (sessionId) => readActiveResearchCanvas(researchCanvasStorage, sessionId, researchBoardsService?.isSharedSession(sessionId)
      ? researchBoardsService.readSharedCanvas(sessionId)
      : readStoredResearchCanvas(researchCanvasStorage, sessionId)),
    canReadSession: (sessionId) => {
      if (!researchBoardsService?.isSharedSession(sessionId)) return true
      try {
        researchBoardsService.readSharedCanvas(sessionId)
        return true
      } catch { return false }
    },
    resolveFile: (identity) => researchFilePreviewRegistry!.resolveExportSource(identity)
  })
  const researchContext = await researchContextBridge.start()
  disposeResearchContextHandlers = registerResearchContextHandlers({
    ipcMain, getMainWindow: () => mainWindow, bridge: researchContextBridge
  })
  protocol.handle(
    RESEARCH_PREVIEW_SCHEME,
    (request) => handleResearchFilePreviewProtocolRequest(
      knowledgeFilePreview?.registry.ownsUrl(request.url) ? knowledgeFilePreview.registry : researchFilePreviewRegistry!,
      () => mainWindow,
      request
    )
  )
  accountService = new AccountService(join(app.getPath('userData'), 'accounts'), {
    origin: acceptanceOrigin,
    onHostedQuotaChanged: () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('account:quota-changed')
    }
  })
  const accountEndpoint = await accountService.start()
  const collaborationClient=new CollaborationClient(accountService, { origin: acceptanceOrigin })
  knowledgeShared = new KnowledgeSharing({ client: collaborationClient, authenticated: () => accountService?.authenticated === true })
  const knowledgePreviewCache = await mkdtemp(join(tmpdir(), 'ework-knowledge-preview-'))
  knowledgeFilePreview = new KnowledgeFilePreview(knowledgePreviewCache, knowledgeIdentity, knowledge, knowledgeShared)
  accountService.subscribeSessionChanged(() => {
    knowledgeFilePreview?.reset()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('knowledge:account-changed')
  })
  app.once('will-quit', () => { void rm(knowledgePreviewCache, { recursive: true, force: true }).catch(() => {}) })
  const boardsToken=randomUUID()
  researchBoardIntegration=new ResearchBoardIntegration({root:join(app.getPath('userData'),'research-board-runtime'),storage:researchCanvasStorage,registry:researchFilePreviewRegistry,clipboard:()=>researchClipboardService,client:collaborationClient,service:()=>researchBoardsService!,runtimeUrl:()=>runtime?.snapshot().url,runtimeToken:boardsToken,revealFile:target=>shell.showItemInFolder(target),invalidate:id=>researchContextBridge?.invalidateSession(id)})
  researchBoardsService = new ResearchBoardsService({
    store: new ResearchBoardsStore(app.getPath('userData')),
    storage: researchCanvasStorage,
    account: accountService,
    client: collaborationClient,
    hooks: researchBoardIntegration.hooks
  })
  disposeResearchBoardsHandlers = registerResearchBoardsHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    service: researchBoardsService
  })
  researchBoardsService.subscribe(event => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('research:boards:event', event)
    }
  })
  void researchBoardsService.start().catch(error =>
    console.warn('[research-boards] unable to start collaboration', error)
  )
  registerTrustedMainWindowHandler(ipcMain, 'account:invoke', () => mainWindow, async (_event, action: string, input: unknown) => {
    const account = accountService!
    const generation = account.generation
    const result = await account.invoke(action, input)
    const runtimeUrl = runtime?.snapshot().url
    if (runtimeUrl && generation !== account.generation) {
      try {
        const response = await fetch(new URL('/sherlock/hosted-ai/account-changed', runtimeUrl), {
          method: 'POST', headers: { authorization: 'Bearer ' + accountEndpoint.token },
          redirect: 'error', signal: AbortSignal.timeout(12_000)
        })
        await response.body?.cancel()
      } catch {
        // The runtime's catalog poll will recover if its server is restarting.
      }
    }
    return result
  })
  createWindow()
  desktopComputer = createComputerCandidates()
  const browserApp = registerBrowserApp({
  runtimeUrl: () => runtime?.snapshot().url,ipcMain,getMainWindow:()=>mainWindow,root:join(app.getPath('userData'),'browser-app'),materialDirectory:async sessionId=>{const root=await new HarnessWorkspaceFileResolver(join(app.getPath('userData'),'harness')).resolveRoot(sessionId);if(!root)throw Error('会话工作区不可用。');return join(root,'浏览器工作材料')}})
  const conversationBrowser = registerConversationBrowser({ipcMain,getMainWindow:()=>mainWindow,locale:harnessLocale})
  localSearchRuntime = await startLocalSearchRuntime({
    createWindow: createLocalSearchWindow,
    searchHosted: (query, maxResults, signal) => accountService!.searchHosted(query, maxResults, signal),
    readPage: readBrowserPage,
    browserUse: (input,signal)=>routeBrowserUse(input,signal,browserApp,(value,abort)=>conversationBrowser.run(value,abort)),
    computerUse: (input, signal) => {
      if (!integrationService) throw Error('Computer Use 插件服务不可用');
      integrationService.assertComputerUseAccess(input);
      return desktopComputer!.run(input, signal);
    }
  })
  // Integrations are isolated from core startup: a damaged registry must never hide conversations.
  let scheduledStoreForIntegrations: TaskStore | undefined
  const taskRpc = harnessRpc(() => runtime?.snapshot().url)
  const knowledgeWorkspaceFiles = new HarnessWorkspaceFileResolver(dshHome)
  const calendarNotes = new NotesStore(join(app.getPath('userData'), 'workspace-notes'))
  const knowledgeWorkbooks = new SpreadsheetStore(app.getPath('userData'))
  const retainKnowledgeCopy = knowledgeCopyRetention(() => runtime?.snapshot().url)
  const knowledgeSessionEvidence = (owner: string, id: string, mode: KnowledgeSessionMode) => {
    let hasContent = false
    try {
      const shared = researchBoardsService?.isSharedSession(id)
      if (mode === 'research') {
        const canvas = shared ? researchBoardsService!.readSharedCanvas(id)
          : readStoredResearchCanvas({ getItem: key => researchCanvasStorage.peekItem(key) }, id)
        hasContent = researchHasContent(canvas)
      } else if (!shared) {
        hasContent = mode === 'notes' ? calendarNotes.hasContent(owner, id)
          : knowledgeWorkbooks.hasContent({ owner, sessionId: id })
      }
    } catch { /* Unavailable or corrupt sessions stay out of the directory. */ }
    return { id, hasContent }
  }
  const recoverKnowledgeCopies = async (url: string) => {
    const { owner, generation } = knowledgeIdentity()
    await retainExistingKnowledgeCopies({
      rpc: taskRpc, retain: retainKnowledgeCopy,
      getMode: id => researchCanvasStorage.peekItem('ework.session.view.v1:' + id),
      hasContent: (id, mode) => !researchBoardsService?.isSharedSession(id) && knowledgeSessionEvidence(owner, id, mode).hasContent,
      check: () => runtime?.snapshot().url === url && knowledgeIdentity().generation === generation
    }).catch(error => console.warn('[knowledge] unable to check saved copies', error))
  }
  installKnowledgeIpc({
    store: knowledge, sharing: knowledgeShared, content: knowledgeContent, window: () => mainWindow,
    identity: knowledgeIdentity, filePreview: knowledgeFilePreview,
    copySession: createKnowledgeSessionCopier({
      rpc: taskRpc, retain: retainKnowledgeCopy, notes: calendarNotes, workbooks: knowledgeWorkbooks, research: researchCanvasStorage,
      canvases: factoryCanvases,
      fallbackWorkspacePath: join(app.getPath('userData'), 'knowledge-workspaces', '知识库副本')
    }),
    sessionEvidence: knowledgeSessionEvidence,
    sessionSnapshot: async (owner, id, mode, displayTitle, check) => {
      const catalog = await taskRpc<{ items: SessionSummary[] }>('session.list', {})
      check()
      const session = catalog.items.find(item => item.sessionId === id && !item.parentSessionId && item.origin !== 'subagent')
      if (!session || isScheduledSession(id)) throw Error('只能共享当前工作区的会话。')
      const projectedTitle = session.projections?.values.title
      const title = typeof projectedTitle === 'string' && projectedTitle.trim() ? projectedTitle : displayTitle
      const shared = researchBoardsService?.isSharedSession(id)
      if (shared) {
        const binding = researchBoardsService?.getBinding(id)
        if (mode !== 'research' || !binding ||
            researchBoardsService?.taskAuthority(owner, binding.boardId).snapshot.board.role !== 'owner') {
          throw Error('只有研究看板所有者可以发布快照。')
        }
      }
      if (mode === 'notes') return createKnowledgeSessionSnapshot({ mode, note: calendarNotes.load(owner, id).saved }, title)
      if (mode === 'spreadsheet') return createKnowledgeSessionSnapshot({ mode, workbook: knowledgeWorkbooks.workbookWithContent({ owner, sessionId: id }) }, title)
      const canvas = shared ? researchBoardsService!.readSharedCanvas(id)
        : readStoredResearchCanvas({ getItem: key => researchCanvasStorage.peekItem(key) }, id)
      return createKnowledgeSessionSnapshot({ mode, canvas, readLayout: (prefix, suffix) =>
        (shared && prefix === 'ework.research.grid.v1:' ? researchCanvasStorage.peekItem('ework.research.shared-grid.v1:' + id + suffix) : null) ??
        researchCanvasStorage.peekItem(prefix + id + suffix)
      }, title)
    },
    generatedWorkspace: sessionId => researchBoardsService?.isSharedSession(sessionId) || isScheduledSession(sessionId)
      ? Promise.resolve(null) : knowledgeWorkspaceFiles.resolveRoot(sessionId)
  })
  try {
    memoryService = await MemoryService.open({
      root: join(app.getPath('userData'), 'memory'), encryption: safeStorage,
      owner: () => integrationOwner() || 'local',
      cloudMemory: (owner,query,remember) => accountService!.openVikingMemory(owner,query,remember),
      isShared: id => researchBoardsService?.isSharedSession(id) === true,
      workspaceRoot: id => new HarnessWorkspaceFileResolver(dshHome).resolveRoot(id),
      legacyRoot: join(dshHome, 'memories'),
      semanticConfig: {node:join(app.getAppPath(),'node_modules/node/bin/node'),worker:join(app.getAppPath(),'node_modules/dsh-memory-runtime/local/worker.js'),model:app.isPackaged?join(process.resourcesPath,'memory-model'):join(app.getAppPath(),'build/memory-model')},
      changed: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('memory:changed') }
    })
    memoryEndpoint = await startMemoryBridge(memoryService)
  } catch { console.error('[memory] 本地记忆暂不可用，原数据已保留') }
  registerMemoryIpc(ipcMain, () => mainWindow, memoryService ?? {request: async () => { throw Error('本地记忆暂不可用，原数据已保留。') }})
  registerTrustedMainWindowHandler(ipcMain,'memory:open-directory',()=>mainWindow,async()=>{
    if(!memoryService)throw Error('记忆目录暂不可用。')
    const location=await memoryService.directory(),error=await shell.openPath(location.directory)
    if(error)throw Error('记忆目录暂时无法打开，请稍后重试。')
    return {ok:true}
  })
  registerTrustedMainWindowHandler(ipcMain, 'memory:open-source', () => mainWindow, async (_event, input) => {
    const source = input as import('../shared/memory').MemorySource
    if(!memoryService||typeof source?.sessionId!=='string'||typeof source.excerpt!=='string')throw Error('SOURCE_UNAVAILABLE')
    const snapshot=await memoryService.request({type:'snapshot'})
    if(!snapshot.rows.some(row=>row.sources.some(s=>s.sessionId===source.sessionId&&s.excerpt===source.excerpt&&s.seq===source.seq&&s.kind===source.kind&&s.noteId===source.noteId&&s.noteRevision===source.noteRevision&&s.messageId===source.messageId)))throw Error('SOURCE_UNAVAILABLE')
    if(source.kind==='note'){
      if(!source.noteId||!Number.isSafeInteger(source.noteRevision))throw Error('SOURCE_UNAVAILABLE')
      const note=calendarNotes.load(integrationOwner()||'local',source.sessionId).saved
      const blocks=(items:any[]):any[]=>items.flatMap(b=>[b,...blocks(b.children??[])])
      const block=blocks(note.blocks).find(b=>b.id===source.noteId)
      if(note.revision!==source.noteRevision||!block)throw Error('SOURCE_UNAVAILABLE')
    }else if(source.kind!=='conversation'||!Number.isSafeInteger(source.seq)&&!source.messageId)throw Error('SOURCE_UNAVAILABLE')
    const response=await taskRpc<{items:{sessionId:string}[]}>('session.list',{})
    if(!response.items.some(s=>s.sessionId===source.sessionId))throw Error('SOURCE_UNAVAILABLE')
    return {ok:true}
  })
  let noteComponentLibrary:Awaited<ReturnType<typeof installComponentLibrary>>
  const canReadNoteSession = (sessionId:string) => { try { if (researchBoardsService?.isSharedSession(sessionId)) researchBoardsService.readSharedCanvas(sessionId); return true } catch { return false } }
  const noteFiles = new NoteFiles({root:join(app.getPath('userData'),'workspace-notes','files'),registry:researchFilePreviewRegistry!,owner:()=>integrationOwner()||'local',canRead:canReadNoteSession,workspaceRoot:sessionId=>new HarnessWorkspaceFileResolver(join(app.getPath('userData'),'harness')).resolveRoot(sessionId),reveal:path=>shell.showItemInFolder(path)})
  registerPptxAnnotationHandlers({ ipcMain, getMainWindow: () => mainWindow, service: new PptxAnnotationService({
    root: join(app.getPath('userData'), 'pptx-annotations'), owner: () => integrationOwner() || 'local',
    presentationSkill: async id => integrationService?.getPresentationSkill(id) ?? null,
    resolveWorkspace: sessionId => canReadNoteSession(sessionId) ? new HarnessWorkspaceFileResolver(dshHome).resolveRoot(sessionId) : Promise.resolve(null),
    resolveAuthorizedSource: async (sessionId, source) => {
      if (!canReadNoteSession(sessionId)) return null
      if (source.kind === 'knowledge-file') return knowledgeFilePreview?.annotationSource(source.nodeId) ?? null
      if (source.kind === 'note-file') {
        const file = await noteFiles.reference(integrationOwner() || 'local', sessionId, { nodeId: source.nodeId, authorizationId: source.authorizationId })
        return { path: file.path, root: dirname(file.path) }
      }
      return researchFilePreviewRegistry!.resolvePptxEditIdentity({ sessionId, nodeId: source.nodeId, authorizationId: source.authorizationId })
    },
    previewSource: async (sessionId, source) => {
      if (!canReadNoteSession(sessionId)) return null
      if (source.kind === 'knowledge-file') {
        const result = await knowledgeFilePreview?.open(source.nodeId, sessionId)
        const file = await knowledgeFilePreview?.annotationSource(source.nodeId)
        return file && result?.kind === 'media' && result.editablePresentation
          ? { url: result.url, path: file.path } : null
      }
      const previewSessionId = source.kind === 'note-file'
        ? (await noteFiles.bind(integrationOwner() || 'local', sessionId, source)).previewSessionId
        : sessionId
      const preview = await researchFilePreviewRegistry!.restore({ sessionId: previewSessionId, nodeId: source.nodeId, authorizationId: source.authorizationId })
      if (!preview) return null
      const resolved = await researchFilePreviewRegistry!.resolvePptxEditSource(preview.url)
      return resolved ? { url: preview.url, path: resolved.path } : null
    },
    readHistory: async input => {
      const history = await taskRpc<{ events: Array<{ event: PptxAnnotationHistoryEvent }>; hasMore: boolean }>('session.history', input)
      return { events: history.events.map(item => item.event), hasMore: history.hasMore }
    },
  }) })
  const noteNativeMenu = new NoteNativeMenu({getWindow:()=>mainWindow,owner:()=>integrationOwner()||'local',canRead:canReadNoteSession})
  const componentExportFiles={
    showSaveDialog:async(options:Record<string,unknown>)=>{
      const window=mainWindow
      return !window||window.isDestroyed()?{canceled:true}:dialog.showSaveDialog(window,options as SaveDialogOptions)
    },
    writeFile:researchCanvasExportFileOperations().writeFile
  }
  app.once('before-quit', installNotesService({ ipcMain, getWindow: () => mainWindow, onDocumentAdapter:adapter=>{notesDocumentAdapter=adapter},
    root: join(app.getPath('userData'), 'workspace-notes'), owner: () => integrationOwner() || 'local',
    runtimeUrl: () => runtime?.snapshot().url, clipboard: () => researchClipboardService,
    canRead:canReadNoteSession,canWrite:sessionId=>!researchBoardsService?.isSharedSession(sessionId),canvasAvailable:sessionId=>canvasActions.isAvailable(sessionId),inspectCanvas:(sessionId,signal,args)=>canvasActions.execute({sessionId,method:'inspect',args:args??{}},signal),resetZoom:()=>executeDesktopMenuCommand('zoom-reset'),windowAction:clientWindowAction,nativeMenu:noteNativeMenu,library:()=>noteComponentLibrary,
    componentData:{request:(sessionId,args,control)=>{if(!noteComponentDataService)throw Error('组件数据刷新服务暂不可用。');return noteComponentDataService.request(sessionId,args,control)},visible:(sessionId,active)=>noteComponentDataService?.engine.setVisible(sessionId,active),reply:value=>noteComponentActions.respond(value)},
    captureSources:(sessionId,sources)=>{if(!researchContextBridge)throw Error('笔记资料服务暂不可用。');return researchContextBridge.captureSources(sessionId,sources)},
    files:noteFiles,exportFiles:componentExportFiles,documentContent:knowledgeContent
  }))
  try {
    integrationService = await IntegrationService.open({
      root: join(app.getPath('userData'), 'integrations'), encryption: safeStorage,
      getOwnerId: integrationOwner, bundledCatalogRoot: desktopResourcePath('integration-catalog'),
      bundledSkillDirectory: bundledSkillDirectory(),
      bundledComputerUseRoot: process.platform === 'darwin' ? join(app.getAppPath(), 'node_modules/dsh-integration-runtime') : undefined,
      onComputerUseRevoked: () => desktopComputer?.cancel(),
      bundledDatapro: { request: (body, signal) => accountService!.dataproMcpRequest(body, signal), authenticated: () => accountService!.authenticated },
      bundledTushare:{request:(body,signal)=>accountService!.tushareMcpRequest(body,signal),authenticated:()=>accountService!.authenticated},
      clientVersion: app.getVersion(),
      legacySkillRoots: legacySkillRoots({ userDataRoot: app.getPath('userData'), bundledSkillDirectory: bundledSkillDirectory() }),
      legacyConnectionSources: legacyConnectionSources({userDataRoot:app.getPath('userData')}),
      selectSkill: async () => {
        if (!mainWindow) return null
        const result = await dialog.showOpenDialog(mainWindow, { title: '导入技能', properties: ['openFile', 'openDirectory'], filters: [{ name: '技能定义', extensions: ['md'] }] })
        return result.canceled ? null : result.filePaths[0] ?? null
      },
      resolveContext: context => resolveIntegrationContext(context, {
        ownerId: integrationOwner(), tasks: [...(scheduledStoreForIntegrations?.list() ?? []),...(componentDataService?.contextTasks() ?? []),...(noteComponentDataService?.contextTasks() ?? [])],
        workspaces: async () => (await taskRpc('workspace.list', {})).items,
        sessions: async sessionId => (await taskRpc('session.list', { identitySessionId: sessionId })).items,
      }),
      approveWrite: async (_call, tool, connection) => {
        return maySkipGrantedToolPrompt(tool, connection)
      },
    })
    integrationService.providers['google-calendar'] = new GoogleCalendarAdapter(integrationService.vault, { openExternal: url => shell.openExternal(url) })
    integrationService.providers.notion = new NotionAdapter(integrationService.vault)
    void integrationService.scanLegacySkills()
  } catch (error) { console.error('[integrations] registry unavailable; preserving existing files', error instanceof IntegrationError ? error.code : 'STORAGE_UNAVAILABLE') }
  const unavailableIntegration = () => { throw new IntegrationError('STORAGE_UNAVAILABLE', '连接数据暂时不可用，原数据已保留，请检查日志') }
  registerIntegrationIpc(ipcMain, () => mainWindow, integrationService ?? { request: async () => unavailableIntegration() })
  integrationEndpoint = await startIntegrationBridge(integrationService ?? {
    runtimeSnapshot: () => ({ revision: 0, runtimeEpoch: 'unavailable', ownerAccountId: 'unavailable', connections: [], tools: [], skills: [], plugins: [] }),
    execute: async () => unavailableIntegration(), readSkill: async () => unavailableIntegration(),
  })
  stopIntegrationIdentity = accountService.subscribeSessionChanged(() => {
    memoryService?.rotateIdentity()
    noteNativeMenu.close()
    integrationService?.rotateIdentity()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('integrations:identity-changed')
    void integrationService?.scanLegacySkills()
    if (accountService?.authenticated && !accountService.accountId) void accountService.invoke('me', undefined).catch(() => {})
    const snapshot = runtime?.snapshot()
    if (snapshot?.phase === 'ready' && snapshot.url) {
      void recoverKnowledgeCopies(snapshot.url)
      queueKnowledgeHistory()
    }
  })
  if (accountService.authenticated && !accountService.accountId) void accountService.invoke('me', undefined).catch(() => {})
  const dependencyIndex = integrationService ? new DependencyIndex(integrationService.store) : undefined
  runtime = new HarnessRuntime({
    dshEntryPath: dshEntryPath(),
    nodeExecutablePath: bundledNodePath(),
    nodeEntryPath: harnessNodeEntryPath(),
    dshPatchPath: desktopResourcePath('dsh-desktop.patch.yml'),
    bundledSkillDirectory: bundledSkillDirectory(),
    bundledWebSearchEntry: bundledWebSearchEntry(),
    bundledMarketInstallerEntry: bundledMarketInstallerEntry(),
    bundledResearchTaskEntry: bundledResearchTaskEntry(),
    bundledFundResearchEntry: bundledFundResearchEntry(),
    computerUseBinary: process.platform === 'darwin' ? join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build'), 'native', 'peekaboo') : undefined,
    computerUseExecutables: process.platform === 'darwin' ? {
      'builtin:computer-use-peekaboo': join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build'), 'native', 'peekaboo')
    } : undefined,
    bundledIntegrationEntry: pathToFileURL(join(app.getAppPath(), 'node_modules/dsh-integration-runtime/index.js')).href,
    bundledMemoryEntry: pathToFileURL(join(app.getAppPath(), 'node_modules/dsh-memory-runtime/index.js')).href,
    memoryEndpoint,
    integrationEndpoint,
    accountEndpoint,
    localSearchUrl: localSearchRuntime.endpoint.url,
    localSearchToken: localSearchRuntime.endpoint.token,
    researchContext: {...researchContext,boardsToken},
    dshHome,
    logPath: join(app.getPath('logs'), 'harness.log'),
    launchProcess: (executablePath, args, options) => spawn(executablePath, args, options),
    onChanged: (snapshot) => {
      if (snapshot.phase === 'starting') integrationService?.rotateIdentity()
      if (snapshot.phase === 'ready' && snapshot.url) {
        void openHarness(snapshot.url).catch(showUnexpectedError)
        void recoverKnowledgeCopies(snapshot.url)
        queueKnowledgeHistory()
      } else if (snapshot.phase === 'failed') {
        void showRuntimeFailure(snapshot)
      }
    }
  })
  registerHarnessHandlers(researchCanvasStorage)
  const scheduledStore = new TaskStore(join(app.getPath('userData'), 'scheduled-tasks.json'), Date.now, prompt => generateTaskTitle(runtime.snapshot().url, prompt))
  isScheduledSession = id => scheduledStore.list().some(task => task.sessionId === id || task.runs.some(run => run.sessionId === id))
  let scheduledLoadError: unknown
  try { await scheduledStore.load() } catch (error) { scheduledLoadError = error; console.error('[scheduled-tasks]', error) }
  scheduledStoreForIntegrations = scheduledStore
  for (const task of scheduledStore.list()) {
    if (task.deletedAt) await dependencyIndex?.removeTask(task.id)
    else try{await dependencyIndex?.syncBindings(task.id, task.integrationBindings ?? [])}catch{console.warn('[integrations] task dependency index update unavailable')}
  }
  try { if (integrationService) componentDataService = await createComponentDataService({file:join(app.getPath('userData'),'component-data-bindings.json'),skillDirectory:bundledSkillDirectory(),integrations:integrationService,canvas:canvasActions,rpc:taskRpc,owner:integrationOwner,isShared:id=>researchBoardsService?.isSharedSession(id)===true,personalBoard:id=>researchBoardsService?.getSnapshot().favorites.find(board=>board.sessionId===id&&board.dedicated),onStatusChange:(sessionId,rows)=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('component-data:status',{sessionId,rows})}}) } catch(error) { console.error('[component-data] 配置读取失败，原文件已保留',error) }
  try { if(integrationService) noteComponentDataService=await createComponentDataService({file:join(app.getPath('userData'),'note-component-data-bindings.json'),skillDirectory:bundledSkillDirectory(),integrations:integrationService,canvas:noteComponentActions,rpc:taskRpc,owner:integrationOwner,isShared:id=>researchBoardsService?.isSharedSession(id)===true,onStatusChange:(sessionId,rows)=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('notes:component-data-status',{owner:integrationOwner()||'local',sessionId,rows})}}) } catch(error) { console.error('[notes-component-data] 配置读取失败，原文件已保留',error) }
  const financialIdentity=()=>accountService?.authenticated?accountService.accountId??null:null
  const financialWidgetData=createPublicFinancialWidgetData({identity:financialIdentity,accountSources:{
    tushare:(body,signal)=>accountService!.tushareMcpRequest(body,signal),
    datapro:(body,signal)=>accountService!.dataproMcpRequest(body,signal),
    doubao:(query,count,signal)=>accountService!.doubaoSearch(query,count,signal)
  }})
  registerTrustedMainWindowHandler(ipcMain,'research:financial-widget',()=>mainWindow,(_event,args:unknown)=>financialWidgetData.query(args))
  registerTrustedMainWindowHandler(ipcMain,'research:financial-open-link',()=>mainWindow,(_event,url:unknown)=>openClientLink(mainWindow,url))
  noteComponentLibrary=await installComponentLibrary({ipcMain,getWindow:()=>mainWindow,file:join(app.getPath('userData'),'component-library.json'),readCanvas:id=>researchBoardsService?.isSharedSession(id)?researchBoardsService.readSharedCanvas(id):readStoredResearchCanvas(researchCanvasStorage,id),getBinding:(sessionId,nodeId)=>componentDataService?.engine.list(sessionId).find((b:any)=>b.nodeId===nodeId),owner:integrationOwner})
  const conversationComponentStore=new ConversationComponentStore(join(app.getPath('userData'),'conversation-components.json'))
  try{await conversationComponentStore.load();conversationComponentsReady=true}catch(error){console.error('[conversation-components] 读取失败，原文件已保留',error)}
  conversationComponentsService=createConversationComponentService({
    store:conversationComponentStore,owner:()=>integrationOwner()||'local',
    canReadSession:id=>!isScheduledSession(id)&&canReadNoteSession(id),
    canWriteSession:id=>!researchBoardsService?.isSharedSession(id),
    currentVisibleContext:()=>clientCapabilities.currentVisibleContext(),
    nativeQuery:query=>financialWidgetData.query(query),
    clipboard:()=>researchClipboardService,library:()=>noteComponentLibrary,exportFiles:componentExportFiles
  })
  app.once('before-quit',installConversationComponentHandlers({ipcMain,getWindow:()=>mainWindow,service:conversationComponentsService}))
  await installCalendarService({shared:researchBoardsService?new SharedCalendarStore(researchBoardsService):undefined,getWindow:()=>mainWindow,ensureWindow:async()=>{const url=runtime.snapshot().url;if(url)await openHarness(url)},isShared:id=>researchBoardsService?.isSharedSession(id)===true,english:()=>harnessLocale()==='en',exists:target=>{
    if(readStoredResearchCanvas(researchCanvasStorage,target.sessionId).artifacts.some((n:any)=>n.id===target.nodeId&&n.containerSpec?.type==='calendar-tool'))return true
    try{return canReadNoteSession(target.sessionId)&&findNoteComponent(calendarNotes.load(integrationOwner()||'local',target.sessionId).saved.blocks,target.nodeId)?.containerSpec?.type==='calendar-tool'}catch{return false}
  }})
  ipcMain.handle('component-data:request',async(event,sessionId:string,args:any)=>{
    assertTrustedMainWindowEvent(event,mainWindow)
    if(!componentDataService)throw Error('数据刷新服务不可用')
    return componentDataService.request(sessionId,args)
  })
  ipcMain.handle('component-data:visibility',(event,sessionId:string,active:boolean)=>{
    assertTrustedMainWindowEvent(event,mainWindow)
    componentDataService?.engine.setVisible(sessionId,active)
  })
  const componentExecutor = new ScheduledComponentExecutor(scheduledStore, async (target, method, args) => {
    canvasActions.bind({sessionId:target.sessionId,selectedIds:[target.nodeId]})
    return canvasActions.execute({sessionId:target.sessionId,method,args,scheduled:true})
  }, async target => {if(!componentDataService)throw Error('数据刷新服务不可用');const result=await componentDataService.request(target.sessionId,{action:'refresh',nodeId:target.nodeId});if(Array.isArray(result))throw Error('刷新结果无效');return result})
  const watchExecutor = new ScheduledMarketWatchExecutor({owner: () => integrationOwner() || 'local', publicData: createPublicDataClient({root: bundledSkillDirectory()})})
  scheduledRunner = new TaskRunner(scheduledStore, taskRpc, () => !scheduledLoadError && runtime.snapshot().phase === 'ready', (task, run) => {
    if (Notification.isSupported()) new Notification({ title: task.title, body: run.watchResult?.summary ?? (run.status === 'success' ? (task.component ? '组件已按计划更新' : '定时任务已完成，打开专属对话查看结果') : `定时任务需要处理：${run.error}`) }).show()
  }, Date.now, componentExecutor, async task => {
    if (!task.integrationBindings?.length) return { ready: true, issues: [] }
    if (!dependencyIndex || !integrationService) return { ready: false, issues: [{ message: '连接检查服务暂不可用' }] }
    const state = integrationService.store.snapshot(), owner = integrationOwner()
    if (task.integrationBindings.some(binding => {
      const entity = binding.kind === 'connection' ? state.connections[binding.entityId] : binding.kind === 'plugin' ? state.plugins[binding.entityId] : state.skills[binding.entityId]
      return entity?.ownerAccountId && entity.ownerAccountId !== owner
    })) return { ready: false, issues: [{ message: '任务绑定的能力属于其他账户，请切回原账户或重新配置' }] }
    const tools = task.integrationBindings.flatMap(binding => binding.toolIds).map(id => state.tools[id]).filter(Boolean)
    if (tools.some(tool => { const connection = state.connections[tool!.connectionId]; return !connection || connection.ownerAccountId !== owner || connection.workspaceGrant.mode === 'selected' && !connection.workspaceGrant.workspaceIds.includes(task.workspaceId) })) {
      return { ready: false, issues: [{ message: '部分工具未获当前账户或任务工作区授权，请重新选择连接范围' }] }
    }
    return dependencyIndex.preflight(task.id, task.integrationBindings)
  }, watchExecutor)
  const scheduledTaskService = createScheduledTaskService({store: scheduledStore, runner: scheduledRunner, owner: () => integrationOwner() || 'local', readCanvas: id => readStoredResearchCanvas(researchCanvasStorage, id), isShared: id => researchBoardsService?.isSharedSession(id) === true})
  scheduledTaskRequest = value => scheduledLoadError ? Promise.reject(Error('定时任务数据读取失败，原数据已保留，请检查日志')) : scheduledTaskService.request(value)
  ipcMain.handle('scheduled-tasks:request', async (event, method: unknown, payload: any) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    if (scheduledLoadError) throw new Error('定时任务数据读取失败，原数据已保留，请检查日志')
    const owner = integrationOwner() || 'local'
    if (method === 'list') return scheduledStore.list().filter(task => !task.watch || task.watch.ownerAccountId === owner)
    if (method === 'workspaces') return (await taskRpc('workspace.list', {})).items
    if (method === 'save') {
      const input = validateTask(payload?.input)
      if (input.watch) {
        if (typeof payload.id !== 'string' || !scheduledStore.list().some(task => task.id === payload.id && task.watch?.ownerAccountId === owner)) throw Error('行情提醒请通过原会话创建或编辑')
      } else if (input.component) await componentExecutor.target(input.component)
      else {
        const workspaces = (await taskRpc('workspace.list', {})).items
        if (!workspaces.some((w: any) => w.workspaceId === input.workspaceId)) throw new Error('工作区不存在')
      }
      // Saving a draft does not silently repair or broaden stale integration grants.
      const task = await scheduledStore.save(input, payload.id)
      await dependencyIndex?.syncBindings(task.id, task.integrationBindings ?? [])
      return task
    }
    if (typeof payload?.id !== 'string') throw new Error('任务标识无效')
    const targetTask = scheduledStore.list().find(task => task.id === payload.id)
    if (targetTask?.watch && targetTask.watch.ownerAccountId !== owner) throw Error('任务不存在或没有管理权限')
    if (method === 'run') return scheduledRunner!.run(payload.id)
    if (method === 'pause' || method === 'resume' || method === 'delete') {
      const component=scheduledStore.list().find(t=>t.id===payload.id)?.component
      const result = await scheduledStore.action(payload.id, method)
      if(component && method!=='resume' && componentDataService){const bound=componentDataService.engine.list(component.sessionId).find(b=>b.nodeId===component.nodeId);if(bound)await componentDataService.engine.configure(bound.id,{enabled:false})}
      if (method === 'delete') await dependencyIndex?.removeTask(payload.id)
      return result
    }
    throw new Error('未知任务操作')
  })
  scheduledRunner.start()
  ipcMain.handle('developer-mode:set-enabled', (event, enabled: unknown) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    if (typeof enabled !== 'boolean') {
      throw new Error('Developer mode state must be a boolean.')
    }
    setDeveloperModeEnabled(app.getPath('userData'), enabled)
    return { ok: true }
  })
  ipcMain.removeHandler('harness:open-recovery')
  ipcMain.handle('harness:open-recovery', async (event, frontendErrorMessage?: unknown) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    const message = typeof frontendErrorMessage === 'string' ? frontendErrorMessage : undefined
    const logs = [
      ...rendererPluginFailureLogs,
      ...(message ? [`[stderr] ${message}`] : [])
    ]
    appendRendererPluginRecoveryLog(logs)
    void showPluginRecovery({ message, logs })
    return { ok: true }
  })
  ipcMain.removeHandler('recovery:action')
  ipcMain.handle('recovery:action', (event, action: unknown) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    if (typeof action === 'string' && PLUGIN_RECOVERY_ACTIONS.has(action as PluginRecoveryAction)) {
      resolvePluginRecoveryAction(action as PluginRecoveryAction)
      return { ok: true }
    }
    return { ok: false }
  })
  ipcMain.removeHandler('harness:reset-plugins')
  ipcMain.handle('harness:reset-plugins', async (event, pluginName?: unknown) => {
    assertTrustedMainWindowEvent(event, mainWindow)
    if (pluginName !== undefined && typeof pluginName !== 'string') {
      throw new Error('The failing plugin name must be a string.')
    }
    const dshHome = join(app.getPath('userData'), 'harness')
    await resetPluginProfile(dshHome, pluginName)
    await launchHarness()
    return { ok: runtime.snapshot().phase === 'ready' }
  })
  installMenu()
  await launchHarness()
  if (!developmentBuild && !acceptanceOrigin) {
    startUpdateManager()
  }
}

const initializeAppData = configureAppIdentity()
configureApplicationLocale()
const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const snapshot = runtime?.snapshot()
    if (snapshot?.phase === 'ready' && snapshot.url) {
      void openHarness(snapshot.url).catch(showUnexpectedError)
    }
  })
  app.whenReady().then(() => {
    initializeAppData()
    return bootstrap()
  }).catch(async (error: unknown) => {
    showUnexpectedError(error)
    await localSearchRuntime?.stop()
    disposeResearchContextHandlers?.()
    disposeResearchBoardsHandlers?.()
    researchBoardsService?.stop()
    researchBoardIntegration?.stop()
    await researchContextBridge?.stop()
    app.quit()
  })
  app.on('activate', () => {
    const snapshot = runtime?.snapshot()
    if (snapshot?.phase === 'ready' && snapshot.url) {
      void openHarness(snapshot.url).catch(showUnexpectedError)
    } else if (snapshot?.phase === 'idle') {
      void launchHarness().catch(showUnexpectedError)
    }
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    disposeResearchBoardsHandlers?.()
    researchBoardsService?.stop()
    stopIntegrationIdentity()
    accountService?.stop()
    scheduledRunner?.stop()
    researchVoiceController.dispose()
    if (quitting) return
    event.preventDefault()
    quitting = true
    stopHarnessThemePreferenceSync()
    disposeResearchContextHandlers?.()
    void finishQuitCleanup(
      [() => flushImageFactoryCanvases?.(), () => flushResearchNativeWeb?.(), () => componentDataService?.dispose(), () => noteComponentDataService?.dispose(), () => integrationService?.dispose(), () => integrationEndpoint?.dispose(), () => memoryEndpoint?.dispose(), () => memoryService?.close(), () => desktopComputer?.dispose(), () => stopUpdateManager(), () => runtime?.stop(), () => localSearchRuntime?.stop(), () => researchContextBridge?.stop()],
      () => app.quit(),
      message => console.warn('[shutdown]', message)
    )
  })
}
