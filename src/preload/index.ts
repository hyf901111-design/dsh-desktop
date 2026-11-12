import {question,subscribeQuestion,translationModel} from './browser/region-bridge'
import {BrowserAppView} from './browser/view'
import {NativeBrowserMenuProjection} from './browser/native-menus'
import {createComponentDataBridge} from './component-data-bridge'
import {createClientCapabilitiesBridge} from './client-capabilities'
import {createConversationComponentsBridge} from './conversation-components'
import { WorkspaceSurfaceHost } from './workspace-surface-host'
import { mountNotes } from './notes/mount'
import {createSidebarNewNoteAction} from './sidebar-new-note'
import {createNoteHistoryLoader} from './notes/history-loader'
import {noteUiError} from '../../packages/dsh-research-task-runtime/notes-locale.js'
import { IntegrationView } from './integrations/view'
import { mountMemoryUi } from './memory/view'
import { createSkillUseBridge } from './integrations/skill-use'
import { installSkillCommandBridge } from './integrations/skill-command-bridge'
import { ScheduledTaskView } from './scheduled/view'
import { mountWindowResize } from './window-resize'
import { createCanvasActionsBridge } from './canvas-actions'
import { mountUiLocalization } from './ui-localization'
import { mountFloatingSurfaces } from './floating-surfaces'
import { mountResearchBoardNotifications } from './research-board-notifications-ui'
import { mountAccountUi } from './account-ui'
import { createResearchBoardsBridge } from './research-boards'
import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron'
import type { UpdateStatus } from '../shared/contracts'
import type { PptxAnnotationBridge } from '../shared/pptx-annotations'
import { developerModeEnabledFromArguments } from '../shared/developer-mode'
import { appVersionFromArguments } from '../shared/app-info'
import { createSherlockAboutBridge } from './about-info'
import {
  DEVELOPER_CONVERSATION_VIEW_IDS,
  DEVELOPER_SETTINGS_SECTION_IDS,
  DeveloperModeController,
  developerModeNoticeText,
  syncDeveloperConversationTabsVisibility,
  setDeveloperSettingsVisibility
} from './developer-mode'
import { isPluginLoadError } from './plugin-error-view'
import { mountDesktopShellStyles } from './shell-style'
import { mountFigmaMotionController } from './figma-motion-controller'
import { mountHomeFlow } from './home-flow'
import { mountHomeAppShortcuts } from './home-app-shortcuts'
import { mountImageGenerationFlow } from './image-generation-flow'
import { mountHomeThemes, getHomeThemeController } from './home-themes'
import {toggleHomeAppearance} from './home-theme-controls'
import {mountPowerSettings} from './power-settings'
import { mountExploreMenu } from './explore-menu'
import { playHomeGuideFromExplore } from './explore-menu-actions'
import { mountHomeGuides } from './home-guides'
import { mountHomeNotesGuide } from './home-guide-notes'
import { mountHomePresentationGuide } from './home-guide-presentation'
import { mountHomeWorkbenchGuide } from './home-guide-workbench'
import { createHomeOperationsActions } from './home-operations-actions'
import { mountFigmaResizeFeedback } from './figma-resize-feedback'
import { mountFigmaScrollbars } from './figma-scrollbars'
import { mountFigmaTaskScrollbar } from './figma-task-scrollbar'
import { mountFigmaResponsiveHeader } from './figma-responsive-header'
import { mountNavigationTitlePreview } from './navigation-title-preview'
import { SidebarUpdateControl } from './sidebar-update-control'
import { requestUpdatePagePreparation } from './update-preparation'
import { mountNativeThemeSync, mountWindowsTitlebar } from './windows-titlebar'

import {
  createResearchPreviewBridge,
  safePathForFile
} from './research-file-path'
import { createResearchVoiceBridge } from './research-voice'
import { createResearchCanvasWheelBridge } from './research-canvas-wheel'
import { createResearchLinkFrameBridge } from './research-link-frame'
import { createResearchYoutubeBridge } from './research-youtube'
import { createResearchContextBridge } from './research-context'
import { createResearchWebReaderBridge } from './research-web-reader'
import { createResearchCanvasExportBridge } from './research-canvas-export'
import { createResearchClipboardBridge } from './research-canvas-clipboard'

if (process.isMainFrame) {
let notesComponentDataAccess:{request:(method:string,input:any)=>Promise<any>;owns:(sessionId:string,owner:string)=>boolean}|undefined

const DEVELOPER_MODE_STYLE_ID = 'sherlock-developer-mode-style'
const DEVELOPER_MODE_NOTICE_ID = 'sherlock-developer-mode-notice'
const locale = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

const initialDeveloperMode = developerModeEnabledFromArguments(process.argv)
const developerMode = new DeveloperModeController({
  getItem: () => (initialDeveloperMode ? 'true' : null),
  setItem: (_key, value) => {
    void ipcRenderer
      .invoke('developer-mode:set-enabled', value === 'true')
      .catch((error: unknown) =>
        console.warn('[developer-mode] unable to persist desktop developer mode', error)
      )
  }
})
const sidebarUpdateControl = new SidebarUpdateControl(document, locale, {
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
  retry: () => ipcRenderer.invoke('desktop-menu:execute', 'check-for-updates')
})

let receivedStatusEvent = false
let bootFailureTriggered = false
let bootFailureTimer: number | undefined
let developerModeNoticeTimer: number | undefined
const pendingBootFailureMessages: string[] = []

const BOOT_FAILURE_SETTLE_MS = 400

function currentBootFailureText(): string | undefined {
  const root = document.body || document.documentElement
  if (!root) return undefined

  // The package list and loader detail are rendered in separate sibling
  // containers on Harness's boot-failure page. Reading only the title's
  // parent drops exactly the evidence Desktop needs to identify the second
  // conflicting plugin, so capture the full failure page instead.
  // Most mutations are streamed chat text. Do not force a whole-document layout
  // just to establish that this is not the loader failure page.
  if (!root.textContent?.includes('Failed to load plugins')) return undefined
  const text = document.body?.innerText || root.textContent
  return text
    ?.split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n')
}

function addBootFailureMessage(message: string | undefined): void {
  const normalized = message?.trim()
  if (!normalized || pendingBootFailureMessages.includes(normalized)) return
  pendingBootFailureMessages.push(normalized)
}

function queueBootFailure(message?: string): void {
  if (bootFailureTriggered) return

  addBootFailureMessage(message)
  addBootFailureMessage(currentBootFailureText())
  if (pendingBootFailureMessages.length === 0) return

  if (bootFailureTimer !== undefined) window.clearTimeout(bootFailureTimer)
  bootFailureTimer = window.setTimeout(() => {
    bootFailureTimer = undefined
    if (bootFailureTriggered) return

    // The web boot page renders the plugin name and detailed loader error after
    // window.error/unhandledrejection fires. Read it one last time before leaving
    // the page so recovery receives the richest available diagnostic evidence.
    addBootFailureMessage(currentBootFailureText())
    const errorText = pendingBootFailureMessages.join('\n')
    if (!errorText) return

    bootFailureTriggered = true
    void ipcRenderer.invoke('harness:open-recovery', errorText)
  }, BOOT_FAILURE_SETTLE_MS)
}

function checkBootFailureInDom(): void {
  const errorText = currentBootFailureText()
  if (!errorText) return
  queueBootFailure(errorText)
}

let domMaintenanceFrame = 0
const domObserver = new MutationObserver(() => {
  if (domMaintenanceFrame) return
  domMaintenanceFrame = window.requestAnimationFrame(() => {
    domMaintenanceFrame = 0
    checkBootFailureInDom()
    syncDeveloperModeVisibility()
    sidebarUpdateControl.mount()
  })
})

contextBridge.exposeInMainWorld('dshDesktopDirectoryPicker', {
  pick: (): Promise<string | null> => ipcRenderer.invoke('directory-picker:open')
})

function initializeUi(): void {
  // Native window controls do not scale with the web content zoom level.
  const syncAuthNativeScale = (): void => {
    const value = String(1 / webFrame.getZoomFactor())
    if (document.documentElement.style.getPropertyValue('--auth-native-scale') !== value) document.documentElement.style.setProperty('--auth-native-scale', value)
  }
  syncAuthNativeScale()
  window.addEventListener('resize', syncAuthNativeScale)
  mountUiLocalization(document)
  mountFloatingSurfaces(document)
  const boards = createResearchBoardsBridge(ipcRenderer)
  mountAccountUi(document, (action, input) => ipcRenderer.invoke('account:invoke', action, input), boards, {explore:process.platform==='darwin'})
  ipcRenderer.on('account:quota-changed', () => window.dispatchEvent(new Event('sherlock:ai-quota-changed')))
  const memoryListeners = new Set<() => void>()
  ipcRenderer.on('memory:changed', () => { for (const listener of memoryListeners) listener() })
  const memoryUi = mountMemoryUi(document, {
    openDirectory:async()=>{await ipcRenderer.invoke('memory:open-directory')},
    request: command => ipcRenderer.invoke('memory:request', command),
    subscribe: listener => { memoryListeners.add(listener); return () => memoryListeners.delete(listener) },
    openSource: async source => {
      await ipcRenderer.invoke('memory:open-source', source)
      return new Promise<void>((resolve, reject) => {
        const requestId=crypto.randomUUID()
        const timeout=window.setTimeout(()=>{document.removeEventListener('sherlock:memory-source-result',result);reject(Error('SOURCE_UNAVAILABLE'))},4000)
        const result=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.requestId!==requestId)return;window.clearTimeout(timeout);document.removeEventListener('sherlock:memory-source-result',result);detail.ok?resolve():reject(Error('SOURCE_UNAVAILABLE'))}
        document.addEventListener('sherlock:memory-source-result',result)
        document.dispatchEvent(new CustomEvent('sherlock:memory-source-open',{detail:{requestId,source}}))
      })
    }
  })
  ipcRenderer.on('memory:save-selection',(_event,value)=>{
    if(typeof value?.content!=='string'||!value.content.trim())return
    const sessionId=value.sessionId||document.documentElement.dataset.eworkMemorySession||document.documentElement.dataset.srbSelectedSession||undefined
    const anchor=document.getSelection()?.anchorNode?.parentElement
    const inNote=!!anchor?.closest('.bn-editor,[data-note-session],.ew-note-editor')
    const block=anchor?.closest<HTMLElement>('.bn-block-outer[data-id]'),note=anchor?.closest<HTMLElement>('[data-note-source-revision]'),message=anchor?.closest<HTMLElement>('[data-event-seq],[data-message-id]')
    document.dispatchEvent(new CustomEvent('sherlock:memory-save-selection',{detail:{content:value.content,title:'选中的内容',sessionId,source:{kind:inNote?'note':'conversation',sessionId,...(inNote&&block&&note?{noteId:block.dataset.id,noteRevision:Number(note.dataset.noteSourceRevision)}:{}),...(!inNote&&message?{...(message.dataset.eventSeq?{seq:Number(message.dataset.eventSeq)}:{}),...(message.dataset.messageId?{messageId:message.dataset.messageId}:{})}:{}),title:'客户端中选中的内容',excerpt:value.content,createdAt:Date.now()}}}))
  })
  mountResearchBoardNotifications(document, boards)
  window.addEventListener('unload', mountImageGenerationFlow(document), { once: true })
  mountDeveloperModeUi()
  if (process.platform === 'win32') {
    mountWindowsTitlebar({ document, ipcRenderer, locale })
  } else if (process.platform === 'darwin') {
    window.addEventListener('unload', mountPowerSettings(document, {
      get: () => ipcRenderer.invoke('desktop-power:get'),
      set: (key, value) => ipcRenderer.invoke('desktop-power:set', key, value)
    }), {once: true})
    mountNativeThemeSync({ document, ipcRenderer })
    mountDesktopShellStyles(document)
    window.addEventListener('unload', mountFigmaMotionController(document), { once: true })
    window.addEventListener('unload', mountHomeFlow(document, { home: false }), { once: true })
    window.addEventListener('unload', mountHomeThemes(document, {
      get: () => ipcRenderer.sendSync('desktop-home-theme:get'),
      set: theme => ipcRenderer.sendSync('desktop-home-theme:set', theme) === true
    }), { once: true })
    window.addEventListener('unload', mountFigmaResizeFeedback(document), { once: true })
    if (process.platform === 'darwin') window.addEventListener('unload', mountWindowResize(document, edge => ipcRenderer.send('desktop-window:resize', edge)), { once: true })
    window.addEventListener('unload', mountFigmaResponsiveHeader(document), { once: true })
    window.addEventListener('unload', mountNavigationTitlePreview(document), { once: true })
    window.addEventListener('unload', mountFigmaTaskScrollbar(document), { once: true })
    void ipcRenderer.invoke('desktop-scrollbars:always-show').then((always: boolean) => {
      window.addEventListener('unload', mountFigmaScrollbars(document, always === true), { once: true })
    }).catch(() => {
      window.addEventListener('unload', mountFigmaScrollbars(document), { once: true })
    })
  }
  sidebarUpdateControl.mount()
  const workspaceSurfaceHost = new WorkspaceSurfaceHost(document)
  const browserApp=new BrowserAppView(document,{
    question,subscribeQuestion,translationModel,
    ...(process.platform==='darwin'||process.platform==='win32'?{
      workspacePointerInBar:bounds=>ipcRenderer.invoke('browser-app:request','workspace-pointer-in-bar',{bounds})
    }:{}),
    request:(method,input)=>ipcRenderer.invoke('browser-app:request',method,input),
    subscribe:listener=>{const handle=(_event:unknown,value:import('../shared/browser-app').BrowserSnapshot)=>listener(value);ipcRenderer.on('browser-app:state',handle);return()=>ipcRenderer.removeListener('browser-app:state',handle)},
    source:(sessionId,source)=>new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const cleanup=()=>{clearTimeout(timer);window.removeEventListener('sherlock:browser-source-reply',reply)};const reply=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.requestId!==requestId)return;cleanup();d.ok?resolve():reject(Error(d.message||'网页来源未能附加。'))};const timer=setTimeout(()=>{cleanup();reject(Error('对话输入尚未就绪。'))},5000);window.addEventListener('sherlock:browser-source-reply',reply);window.dispatchEvent(new CustomEvent('sherlock:browser-source-request',{detail:{requestId,sessionId,source:JSON.stringify(source)}}))})
  },workspaceSurfaceHost)
  ipcRenderer.on('browser-app:context-menu',(_event,value)=>browserApp.pageContextMenu(value))
  ipcRenderer.on('browser-app:context-action',(_event,value)=>browserApp.contextAction(value))
  ipcRenderer.on('browser-app:region-event',(_event,value)=>browserApp.regionEvent(value))
  ipcRenderer.on('browser-app:shortcut',(_event,value)=>window.dispatchEvent(new CustomEvent('sherlock:browser-shortcut',{detail:value})))
  const browserMenus=new NativeBrowserMenuProjection(document,{request:(method,input)=>ipcRenderer.invoke('browser-app:request',method,input),subscribeAction:listener=>{const handle=(_event:unknown,value:any)=>listener(value);ipcRenderer.on('browser-app:menu-event',handle);return()=>ipcRenderer.removeListener('browser-app:menu-event',handle)}})
  window.addEventListener('unload',()=>{browserMenus.dispose();browserApp.dispose()},{once:true})
  const noteOwners = new Map<string, string>()
  let noteIdentityEpoch=0
  const noteHistory=createNoteHistoryLoader({currentEpoch:()=>noteIdentityEpoch,load:sessionId=>ipcRenderer.invoke('notes:request','conversation-load',{sessionId}),accept:(sessionId,value)=>{noteOwners.set(sessionId,value.owner);document.dispatchEvent(new CustomEvent('sherlock:notes-history',{detail:{sessionId,rows:value.rows}}))},onError:error=>console.warn('[notes-history]',noteUiError(error instanceof Error?error.message:String(error)))})
  document.addEventListener('sherlock:notes-history-request',event=>{const sessionId=(event as CustomEvent).detail?.sessionId;if(typeof sessionId==='string'&&sessionId.length>0&&sessionId.length<=256)void noteHistory.request(sessionId)})

  ipcRenderer.on('notes:capability-action',(_event,value)=>{if(value?.owner===noteOwners.get(value?.sessionId))document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:value}))})
  ipcRenderer.on('notes:progress',(_event,value)=>{if(value?.owner===noteOwners.get(value?.sessionId))document.dispatchEvent(new CustomEvent('sherlock:notes-generation-progress',{detail:value}))})
  ipcRenderer.on('notes:menu-event',(_event,value)=>{if(value?.owner&&value.owner===noteOwners.get(value?.sessionId))document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:value}))})
  ipcRenderer.on('notes:component-data-action',(_event,value)=>{if(value?.owner===noteOwners.get(value?.sessionId)||value?.cancel)document.dispatchEvent(new CustomEvent('sherlock:notes-component-data-action',{detail:value}))})
  const notesBridge: import('../shared/workspace-notes').NotesBridge = {
    filePath:file=>safePathForFile(file,webUtils.getPathForFile),
    request: async (method, input) => {
      try {
        const result = await ipcRenderer.invoke('notes:request', method, { ...input, ...(method !== 'load' ? { owner: noteOwners.get(input.sessionId) } : {}) })
        if (method === 'load') noteOwners.set(input.sessionId, result.owner)
        return result
      } catch(error) {
        if(error instanceof Error){const message=noteUiError(error.message);if(message!==error.message)error.message=message}
        throw error
      }
    },
    draft: async input => {try{await ipcRenderer.invoke('notes:request', 'draft', { ...input, owner: noteOwners.get(input.sessionId) })}catch(error){if(error instanceof Error){const message=noteUiError(error.message);if(message!==error.message)error.message=message}throw error}}
  }
  notesComponentDataAccess={request:notesBridge.request,owns:(sessionId,owner)=>owner===noteOwners.get(sessionId)}
  const notes = mountNotes(document, notesBridge, workspaceSurfaceHost)
  const sidebarNewNote=createSidebarNewNoteAction(document,()=>notes.flushCurrent())
  const integrationBridge = { request: (command: import('../shared/integration-ui').IntegrationCommand) => ipcRenderer.invoke('integrations:request', command) }
  const skillUse = createSkillUseBridge(document, integrationBridge, () => { integrationView.close(); workspaceSurfaceHost.revealConversation() })
  const integrationView = new IntegrationView(document, { ...integrationBridge, getPathForFile: file => safePathForFile(file,webUtils.getPathForFile), useSkill: skillUse.useSkill, revealSource: async path => { await ipcRenderer.invoke('filesystem:show-item-in-folder', path) } }, workspaceSurfaceHost)
  const skillCommand = installSkillCommandBridge(document,{...integrationBridge,useSkill:skillUse.useSkill})
  const homeActions = createHomeOperationsActions(document, { ...integrationBridge, useSkill: skillUse.useSkill }, { beforeNavigate: () => notes.flushCurrent() })
  const homeGuides = mountHomeGuides(document, { beforeOpen: session => notes.prepareGuideFromCurrent(session.sessionId), prepareHandoff: (session,signal) => session.kind==='note'?notes.finishGuide(session.sessionId,signal):undefined, revealConversation: () => workspaceSurfaceHost.revealConversation(), mountNotes: (document, host, options) => mountHomeNotesGuide(document, host, { ...options, persistence: notesBridge }), mountPresentation: mountHomePresentationGuide,
    mountWorkbench: mountHomeWorkbenchGuide })
  const disposeHomeOperations = process.platform === 'darwin' ? mountExploreMenu(document, { themeController: getHomeThemeController(document)!, onBeforeOpen:()=>{void homeGuides.reset(false)}, onToggleAppearance: () => toggleHomeAppearance(document), onAction: homeActions.run, onExample:(kind, context)=>playHomeGuideFromExplore(homeGuides,kind,context) }) : () => {}
  integrationView.mount()
  const scheduledView = new ScheduledTaskView(document, {
    list: () => ipcRenderer.invoke('scheduled-tasks:request', 'list'),
    workspaces: () => ipcRenderer.invoke('scheduled-tasks:request', 'workspaces'),
    save: (input, id) => ipcRenderer.invoke('scheduled-tasks:request', 'save', { input, id }),
    action: (id, action) => ipcRenderer.invoke('scheduled-tasks:request', action, { id })
  }, workspaceSurfaceHost, { request: command => ipcRenderer.invoke('integrations:request', command) }, {newNote:sidebarNewNote.create})
  scheduledView.mount()
  const disposeHomeAppShortcuts = mountHomeAppShortcuts(document, async (app, signal) => {
    if (app === 'research' || app === 'note') {
      await homeActions.run(app === 'research' ? 'board' : 'note', { signal, revealComposer: async () => {} })
      return
    }
    await notes.flushCurrent()
    if (signal.aborted) return
    if (app === 'browser') window.dispatchEvent(new CustomEvent('sherlock:browser-request'))
    else if (app === 'plugin') window.dispatchEvent(new CustomEvent('sherlock:integrations-open'))
    else await scheduledView.open()
  })
  window.addEventListener('unload', disposeHomeAppShortcuts, { once: true })
  const resetIntegrationIdentity = () => { window.dispatchEvent(new CustomEvent('sherlock:explore-close',{detail:{restoreFocus:false}}));sidebarNewNote.reset();noteIdentityEpoch++; homeGuides.reset(false); noteHistory.reset(); notes.resetIdentity(); noteOwners.clear(); homeActions.reset(); skillCommand.reset(); skillUse.reset(); scheduledView.resetIntegrationIdentity(); integrationView.resetIdentity(); memoryUi.resetIdentity() }
  ipcRenderer.on('integrations:identity-changed', resetIntegrationIdentity)
  window.addEventListener('unload', () => ipcRenderer.removeListener('integrations:identity-changed', resetIntegrationIdentity), { once: true })
  window.addEventListener('unload', () => { sidebarNewNote.dispose();disposeHomeOperations(); homeGuides.dispose(); homeActions.dispose(); noteHistory.reset(); memoryUi.dispose(); memoryListeners.clear(); notes.dispose(); skillCommand.dispose(); skillUse.dispose(); scheduledView.close(); integrationView.dispose(); workspaceSurfaceHost.dispose() }, { once: true })
  checkBootFailureInDom()
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
}

window.addEventListener('error', (event) => {
  const err = event.error ?? event.message
  if (isPluginLoadError(err)) {
    const errorText = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)
    queueBootFailure(errorText)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  if (isPluginLoadError(reason)) {
    const errorText = typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : String(reason)
    queueBootFailure(errorText)
  }
})

contextBridge.exposeInMainWorld(
  'sherlockDesktopInfo',
  Object.freeze({
    name: 'EWork Odyssey',
    version: appVersionFromArguments(process.argv)
  })
)

contextBridge.exposeInMainWorld('sherlockPptEditor', Object.freeze({
  open: (value: unknown) => ipcRenderer.invoke('pptx:editor:open', value),
  save: (value: unknown) => ipcRenderer.invoke('pptx:editor:save', value),
  preview: (value: unknown) => ipcRenderer.invoke('pptx:editor:preview', value)
}))

contextBridge.exposeInMainWorld('sherlockPptAnnotations', Object.freeze({
  open: value => ipcRenderer.invoke('pptx:annotation:open', value),
  mutate: value => ipcRenderer.invoke('pptx:annotation:mutate', value),
  prepare: value => ipcRenderer.invoke('pptx:annotation:prepare', value),
  bindSubmission: value => ipcRenderer.invoke('pptx:annotation:bindSubmission', value),
  complete: value => ipcRenderer.invoke('pptx:annotation:complete', value),
  lookupOutput: value => ipcRenderer.invoke('pptx:annotation:lookupOutput', value),
  messagePresentation: value => ipcRenderer.invoke('pptx:annotation:messagePresentation', value),
  resolveReference: value => ipcRenderer.invoke('pptx:annotation:resolveReference', value),
  cancel: value => ipcRenderer.invoke('pptx:annotation:cancel', value),
} satisfies PptxAnnotationBridge))

contextBridge.exposeInMainWorld(
  'dshDesktop',
  Object.freeze({
    browserApp: Object.freeze({
      context: ()=>ipcRenderer.invoke('browser-app:request','context'),
      openSource: (value:{sessionId?:string;url:string})=>new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const cleanup=()=>{clearTimeout(timer);window.removeEventListener('sherlock:browser-request-reply',reply)};const reply=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.requestId!==requestId)return;cleanup();d.ok?resolve(d):reject(Error(d.message||'浏览器未能打开。'))};const timer=setTimeout(()=>{cleanup();reject(Error('浏览器入口尚未就绪。'))},8000);window.addEventListener('sherlock:browser-request-reply',reply);window.dispatchEvent(new CustomEvent('sherlock:browser-request',{detail:{...value,requestId}}))})
    }),
    conversationBrowser: Object.freeze({
      openSource: (value: unknown) => ipcRenderer.invoke('conversation:browser:open-source',value),
      activity: (value: unknown) => ipcRenderer.invoke('conversation:browser:activity',value),
      layout: (value: unknown) => ipcRenderer.invoke('conversation:browser:layout',value),
      subscribe: (callback: (value: unknown) => void) => {
        const listener=(_event: unknown,value: unknown)=>callback(value)
        ipcRenderer.on('conversation:browser',listener)
        return ()=>ipcRenderer.removeListener('conversation:browser',listener)
      }
    }),
    researchBoards: createResearchBoardsBridge(ipcRenderer),
    homeGuideAssets: Object.freeze({ request: (input: unknown) => ipcRenderer.invoke('home-guide:assets', input) }),
    showComponentContextMenu: (input: unknown): Promise<string | null> => ipcRenderer.invoke('ui:component-context-menu',input),
    componentContextMenuKey: (menuId: string,key: string) => ipcRenderer.invoke('ui:component-context-menu-key',menuId,key),
    closeComponentContextMenu: (menuId: string) => ipcRenderer.invoke('ui:component-context-menu-close',menuId),
    showFileContextMenu: (items: Array<{ id: string; label: string; disabled?: boolean }>): Promise<string | null> =>
      ipcRenderer.invoke('ui:file-context-menu', items),
    imageAction: (input: unknown) => ipcRenderer.invoke('conversation:image-action', input),
    restartHarness: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('harness:restart'),
    showItemInFolder: (path: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('filesystem:show-item-in-folder', path),
    copyFilePath: (path: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('filesystem:copy-file-path', path),
    researchFilesAvailable: (paths: string[]): Promise<boolean[]> =>
      ipcRenderer.invoke('research:files-available', paths),
    researchCanvasStorage: Object.freeze({
      getItem: (key: string): string | null => {
        const value = ipcRenderer.sendSync('research:canvas-storage:get', key) as unknown
        return typeof value === 'string' ? value : null
      },
      setItem: (key: string, value: string): boolean =>
        ipcRenderer.sendSync('research:canvas-storage:set', key, value) === true
    }),
    researchVoice: createResearchVoiceBridge(ipcRenderer),
    researchCanvasWheel: createResearchCanvasWheelBridge(ipcRenderer),
    scheduledTasks: Object.freeze({list: () => ipcRenderer.invoke('scheduled-tasks:request', 'list')}),
    componentData: createComponentDataBridge(ipcRenderer,(method,input)=>notesComponentDataAccess?.request(method,input)??Promise.reject(Error('笔记状态接口尚未就绪。')),(sessionId,owner)=>notesComponentDataAccess?.owns(sessionId,owner)??false),
    researchCanvasActions: createCanvasActionsBridge(ipcRenderer),
    clientCapabilities:createClientCapabilitiesBridge(ipcRenderer),
    conversationComponents:createConversationComponentsBridge((channel,...args)=>ipcRenderer.invoke(channel,...args)),
    financialWidget: Object.freeze({request:(args:unknown)=>ipcRenderer.invoke('research:financial-widget',args),openExternal:(url:string)=>ipcRenderer.invoke('research:financial-open-link',url)}),
    componentLibrary: Object.freeze({request:(args:unknown)=>ipcRenderer.invoke('research:component-library',args)}),
    calendarTool: Object.freeze({request:(args:unknown)=>ipcRenderer.invoke('research:calendar:request',args),subscribe:(callback:(value:unknown)=>void)=>{const listener=(_event:unknown,value:unknown)=>callback(value);ipcRenderer.on('research:calendar:event',listener);return()=>ipcRenderer.removeListener('research:calendar:event',listener)}}),
    researchRss: Object.freeze({request:(value:unknown)=>ipcRenderer.invoke('research:rss:request',value)}),
    researchYoutube: createResearchYoutubeBridge((channel,value)=>ipcRenderer.invoke(channel,value)),
    researchContext: createResearchContextBridge(
      (channel, value) => ipcRenderer.invoke(channel, value)
    ),
    researchLinkFrame: createResearchLinkFrameBridge(
      (channel, value) => ipcRenderer.invoke(channel, value)
    ),
    researchWebReader: createResearchWebReaderBridge(
      (channel, value) => ipcRenderer.invoke(channel, value)
    ),
    researchCanvasExport: createResearchCanvasExportBridge(
      (channel, value) => ipcRenderer.invoke(channel, value)
    ),
    researchClipboard: createResearchClipboardBridge(
      (channel, value) => ipcRenderer.invoke(channel, value)
    ),
    researchPreview: createResearchPreviewBridge(
      webUtils.getPathForFile,
      (channel, value) => ipcRenderer.invoke(channel, value)
    ),
    // Compatibility for the existing attachment submission path. Preview
    // callers must use researchPreview so raw filesystem paths never become
    // preview credentials or protocol URLs.
    getPathForFile: (file: File): string => safePathForFile(file, webUtils.getPathForFile)
  })
)

contextBridge.exposeInMainWorld(
  'sherlockAbout',
  createSherlockAboutBridge(
    () => ipcRenderer.invoke('updates:status') as Promise<UpdateStatus>,
    () => sidebarUpdateControl.checkFromAbout(() => ipcRenderer.invoke('updates:check') as Promise<UpdateStatus>),
    () => document.documentElement.dataset.odysseyLocale === 'en' ? 'en' : document.documentElement.dataset.odysseyLocale === 'zh' ? 'zh' : locale,
    {
      downloadUpdate: () => ipcRenderer.invoke('updates:download') as Promise<UpdateStatus>,
      installUpdate: () => ipcRenderer.invoke('updates:install') as Promise<void>,
      onUpdateStatusChanged: (listener) => {
        const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status)
        ipcRenderer.on('updates:status-changed', handler)
        return () => ipcRenderer.removeListener('updates:status-changed', handler)
      }
    }
  )
)

contextBridge.exposeInMainWorld(
  'dshRecovery',
  Object.freeze({
    action: (action: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('recovery:action', action)
  })
)

contextBridge.exposeInMainWorld(
  'sherlockDeveloperMode',
  Object.freeze({
    logoClick: (): void => {
      const result = developerMode.logoClick(Date.now())
      if (result.status === 'pending') return

      const enabled = result.status === 'activated'
      document.documentElement.dataset.sherlockDeveloperMode = String(enabled)
      syncDeveloperModeVisibility()
      showDeveloperModeNotice(enabled)
    }
  })
)

function mountDeveloperModeUi(): void {
  document.documentElement.dataset.sherlockDeveloperMode = String(developerMode.isEnabled())

  if (!document.getElementById(DEVELOPER_MODE_STYLE_ID)) {
    const style = document.createElement('style')
    style.id = DEVELOPER_MODE_STYLE_ID
    style.textContent = `${[
      ...DEVELOPER_SETTINGS_SECTION_IDS.map(
        (id) =>
          `html:not([data-sherlock-developer-mode="true"]) [data-settings-section-id="${id}"]`
      ),
      ...DEVELOPER_CONVERSATION_VIEW_IDS.map(
        (id) =>
          `html:not([data-sherlock-developer-mode="true"]) [data-conversation-view-id="${id}"]`
      ),
      'html:not([data-sherlock-developer-mode="true"]) [data-sherlock-developer-tab="true"]'
    ].join(',\n')} { display: none !important; }`
    document.documentElement.appendChild(style)
  }

  syncDeveloperModeVisibility()
}

function syncDeveloperModeVisibility(): void {
  const settingsRows = document.querySelectorAll<HTMLElement>('[data-settings-section-id]')
  setDeveloperSettingsVisibility(settingsRows, developerMode.isEnabled())
  syncDeveloperConversationTabsVisibility(document, developerMode.isEnabled())
}

function showDeveloperModeNotice(enabled: boolean): void {
  window.clearTimeout(developerModeNoticeTimer)
  document.getElementById(DEVELOPER_MODE_NOTICE_ID)?.remove()

  const notice = document.createElement('div')
  notice.id = DEVELOPER_MODE_NOTICE_ID
  notice.role = 'status'
  notice.setAttribute('aria-live', 'polite')
  notice.textContent = developerModeNoticeText(locale, enabled)
  notice.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:28px',
    'z-index:2147483647',
    'transform:translateX(-50%)',
    'pointer-events:none',
    'padding:10px 16px',
    'border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14))',
    'border-radius:10px',
    'color:var(--dsw-alias-label-primary,#f5f5f5)',
    'background:var(--dsw-alias-bg-layer-2,rgba(38,38,41,.96))',
    'box-shadow:0 10px 30px rgba(0,0,0,.28)',
    'font:500 13px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
  ].join(';')
  document.documentElement.appendChild(notice)

  developerModeNoticeTimer = window.setTimeout(() => {
    developerModeNoticeTimer = undefined
    notice.remove()
  }, 2_400)
}

function applyStatus(status: UpdateStatus): void {
  if (status.phase === 'error') window.dispatchEvent(new Event('sherlock:boards:update-resume'))
  sidebarUpdateControl.render(status)
}

ipcRenderer.on('updates:prepare', (_event, requestId: unknown) => {
  if (typeof requestId !== 'string' || requestId.length > 128) return
  void requestUpdatePagePreparation(document).then(
    () => ipcRenderer.send('updates:prepared', requestId),
    (error: unknown) => ipcRenderer.send('updates:prepared', requestId, error instanceof Error ? error.message : String(error))
  )
})

ipcRenderer.on('updates:status-changed', (_event, status: UpdateStatus) => {
  receivedStatusEvent = true
  applyStatus(status)
})

void ipcRenderer
  .invoke('updates:status')
  .then((status: UpdateStatus) => {
    if (!receivedStatusEvent) applyStatus(status)
  })
  .catch((error: unknown) => console.warn('[updater] unable to read update status', error))

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initializeUi, { once: true })
} else {
  initializeUi()
}
}
