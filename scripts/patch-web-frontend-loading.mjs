import {patchHomeThemeAppearance} from './lib/home-theme-appearance.mjs'
import {patchBoardTabsClient,stripBoardTabsClient} from './lib/board-tabs-client.mjs'
import {patchSidebarNewNoteConversation,patchSidebarNewNoteShell,stripSidebarNewNoteConversation,stripSidebarNewNoteShell} from './lib/sidebar-new-note.mjs'
import {patchAssistantReveal} from './lib/assistant-reveal.mjs'
import {patchConversationComponents} from './lib/conversation-components.mjs'
import {patchConversationCompactionLifecycle} from './lib/conversation-compaction-lifecycle.mjs'
import {patchConversationThinkingStatus} from './lib/conversation-thinking-status.mjs'
import {stripPptxAnnotationInput,patchPptxAnnotationInput} from './lib/pptx-annotation-native.mjs'
import {stripPptxAnnotationMessages,patchPptxAnnotationMessages} from './lib/pptx-annotation-message.mjs'
import {patchMemorySourceAnchors} from './lib/memory-source-anchors.mjs'
import {patchCalendarToolClient} from './lib/calendar-tool-client.mjs'
import { patchNotesClient } from './lib/notes-client.mjs'
import { patchSessionViewPreferences, patchNewChatSessionRuntime, patchNewChatSidebar } from './lib/session-view-preferences.mjs'
import { patchNotesComposer } from './lib/notes-composer.mjs'
import {patchNoteFeedbackHost,patchNoteForkHost} from './lib/notes-reply-actions.mjs'
import { patchNoteSessionClient, patchNoteSessionRuntime, patchNoteSessionHost, patchNoteSessionCatalog } from './lib/notes-session.mjs'
import { patchSessionListStreamPerformance } from './lib/session-list-stream-performance.mjs'
import { patchWorkbenchPlanningSessionCatalog, patchWorkbenchPlanningSessionAppend } from './lib/workbench-planning-session.mjs'
import { patchHomeGuideSessionCatalog } from './lib/home-guide-session-catalog.mjs'
import { patchStandardModeClient, patchStandardModeRuntime } from './lib/standard-mode-only.mjs'
import {patchFinancialWidgetClient} from './lib/financial-widget-client.mjs'
import {patchHomeGuideNative,stripHomeGuideNative} from './lib/home-guide-native.mjs'
import {patchHomeGuidePresentationNative,stripHomeGuidePresentationNative} from './lib/home-guide-presentation-native.mjs'
import {patchAttachmentClient} from './lib/attachment-client.mjs'
import {patchDerivedPresetClient} from './lib/derived-preset-client.mjs'
import {patchAudioClient} from './lib/audio-client.mjs'
import {patchYoutubeClient} from './lib/youtube-client.mjs'
import {patchIframeClient} from './lib/iframe-client.mjs'
import { patchComponentDataRefresh } from './lib/component-data-refresh.mjs'
import { patchResearchGridWorkbench, restoreResearchGridWorkbench } from './lib/research-grid-workbench.mjs'
import { patchResearchCreationProgress } from './lib/research-creation-progress.mjs'
import { patchComponentScheduledTasks } from './lib/component-scheduled-tasks.mjs'
import { patchConversationBrowser } from './lib/conversation-browser-client.mjs'
import { patchWorkspaceDragFeedback } from './lib/workspace-drag-feedback.mjs'
import { patchResearchNativeWeb } from './lib/research-native-web-client.mjs'
import { patchCanvasCreationTools } from './lib/canvas-creation-tools.mjs'
import { patchCanvasRefresh } from './lib/canvas-refresh.mjs'
import { patchCanvasActionsClient } from './lib/canvas-actions-client.mjs'
import { patchCanvasUseClient } from './lib/canvas-use-client.mjs'
import { patchCanvasTaskNotices } from './lib/canvas-task-notices.mjs'
import { patchComponentWheelZoom } from './lib/component-wheel-zoom.mjs'
import { patchQuestionCountdown } from './lib/question-countdown.mjs'
import { patchGlmReasoningCapabilities } from './lib/glm-reasoning-capabilities.mjs'
import { patchMarkdownFileLinks } from './lib/markdown-file-links.mjs'
import { patchRestoredFileMentions, patchGeneratedFileMentions, patchGeneratedFilePreview } from './lib/generated-file-preview.mjs'
import { patchDeliverableCards, patchDeliveryConversation } from './lib/deliverable-cards.mjs'
import { patchInspectPortal, patchInspectConversation, patchInspectLayout } from './lib/inspect-sidebar.mjs'
import { patchEmptyHeaderTitles, patchDesktopLocaleBridge, patchDesktopResearchDefaults } from './lib/desktop-locale-bridge.mjs'
import { patchResearchResidentConversation } from './lib/research-resident-conversation.mjs'
import { patchSubagentPanelRuntime, patchSubagentPanelRenderer, patchSubagentPanelConversation, patchSubagentPanelEntry } from './lib/figma-subagent-panel.mjs'
import { patchFigmaCanvasContextMenu } from './lib/figma-canvas-context-menu.mjs'
import { patchFigmaReadingConversation, patchFigmaReadingTables, patchFigmaReadingWeb } from './lib/figma-reading-client.mjs'
import { patchFigmaModelMenu } from './lib/figma-model-menu.mjs'
import { patchSkillCommandPopup, patchSkillCommandLabels } from './lib/skill-command-menu.mjs'
import {patchPlainSlashInput,stripPlainSlashInput} from './lib/plain-slash-input.mjs'
import {patchComposerVoice,stripComposerVoice} from './lib/composer-voice.mjs'
import {patchConversationSubmission,stripConversationSubmission} from './lib/conversation-submission.mjs'
import {patchConversationResponseProgress,stripConversationResponseProgress} from './lib/conversation-response-progress.mjs'
import {patchConversationHistoryRuntime,stripConversationHistoryRuntime,patchConversationHistoryClient,stripConversationHistoryClient} from './lib/conversation-history-page.mjs'
import { patchFigmaPermissionMenu } from './lib/figma-permission-menu.mjs'
import { patchFigmaMenuScope, patchFigmaSettingsModeDescription, patchFigmaEnterDescription } from './lib/figma-menu-scope.mjs'
import { patchFigmaWorkspaceMenus } from './lib/figma-workspace-menus.mjs'
import { patchFigmaContainerMenu } from './lib/figma-container-menu.mjs'
import { patchFigmaProviderMenu } from './lib/figma-provider-menu.mjs'
import { patchFigmaMenuPlacement } from './lib/figma-menu-placement.mjs'
import { patchFigmaRefinementPreset, patchFigmaRefinementConversation, patchFigmaRefinementSubagent, patchFigmaRefinementInputTrigger, patchFigmaNavigationTitles, patchFigmaContextDirectory } from './lib/figma-refinements-client.mjs'
import { patchFigmaFinalLayout } from './lib/patch-figma-final-shell.mjs'
import { patchFigmaSettingsGeneral, patchFigmaSettingsModels, patchFigmaSettingsAppearance, patchFigmaSettingsPreset } from './lib/figma-settings-client.mjs'
import { patchFigmaAboutUpdates, patchFigmaUpdateWorkspace } from './lib/figma-updates-client.mjs'
import { patchFigmaInlineReferences } from './lib/figma-inline-references-client.mjs'
import { patchComposerDeliverablePreview } from './lib/figma-composer-deliverable-preview.mjs'
import { patchConversationFileReference } from './lib/sidebar-file-reference.mjs'
import { patchFigmaTrajectory } from './lib/figma-trajectory-client.mjs'
import { patchFigmaCanvasGestures } from './lib/figma-canvas-gestures.mjs'
import { installResearchBoardClientPatches } from './lib/patch-research-board-client.mjs'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const assetsDirectory = join(
  process.cwd(),
  'node_modules',
  '@deepseek-ai',
  'dsh-web-frontend',
  'dist',
  'assets'
)
const historyRuntimeBundlePath=join(process.cwd(),'node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js')
writeFileSync(historyRuntimeBundlePath,stripConversationHistoryRuntime(readFileSync(historyRuntimeBundlePath,'utf8')))
const llmAdapterPath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js')
writeFileSync(llmAdapterPath, patchGlmReasoningCapabilities(readFileSync(llmAdapterPath, 'utf8')))
const primitivesPath = join(
  process.cwd(),
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-primitives',
  'lib',
  'index.js'
)

const ringMotionCss =
  '@keyframes dsh-state-ring-spin{to{transform:rotate(360deg)}}' +
  '.dsh-state-ring{color:var(--dsw-alias-label-secondary);animation:dsh-state-ring-spin 1s linear infinite}' +
  '@media (prefers-reduced-motion:reduce){.dsh-state-ring{animation:none}}'

function asset(suffix) {
  const matches = readdirSync(assetsDirectory).filter(
    (name) => name.startsWith('index-') && name.endsWith(suffix)
  )
  if (matches.length !== 1) {
    throw new Error(`Expected one dsh-web-frontend ${suffix} asset, found ${matches.length}`)
  }
  return join(assetsDirectory, matches[0])
}

function patchJavaScript(path) {
  let source = readFileSync(path, 'utf8')
  const replacement = 'n==="ongoing"?f.jsx(v9,{size:r,className:ye(yl.matrix,i)})'
  if (source.includes(replacement)) return

  const startNeedle = 'n==="ongoing"?f.jsx("svg",{className:ye(yl.matrix,i)'
  const endNeedle = ':f.jsx("span"'
  const start = source.indexOf(startNeedle)
  const end = source.indexOf(endNeedle, start)
  if (start < 0 || end < 0) throw new Error('Unable to find the running StateDot bundle')

  source = source.slice(0, start) + replacement + source.slice(end)
  writeFileSync(path, source)
}

function patchPrimitives(path) {
  let source = readFileSync(path, 'utf8')
  if (source.includes('className: "dshStateRingMotion"')) return

  const startNeedle = '\tif (state === "ongoing") return jsx("svg", {'
  const endNeedle = '\n\treturn jsx("span"'
  const start = source.indexOf(startNeedle)
  const end = source.indexOf(endNeedle, start)
  if (start < 0 || end < 0) throw new Error('Unable to find the source StateDot component')

  const replacement = [
    '\tif (state === "ongoing") return jsxs(Fragment, {',
    '\t\tchildren: [jsx("style", {',
    '\t\t\tclassName: "dshStateRingMotion",',
    `\t\t\tchildren: ${JSON.stringify(ringMotionCss)}`,
    '\t\t}), jsx(IconLoadingOutline16, {',
    '\t\t\tsize,',
    '\t\t\tclassName: clsx(StateDot_module_css_default.matrix, "dsh-state-ring", className)',
    '\t\t})]',
    '\t});'
  ].join('\n')

  source = source.slice(0, start) + replacement + source.slice(end)
  writeFileSync(path, source)
}

function patchStyles(path) {
  let source = readFileSync(path, 'utf8')
  const replacement =
    '._matrix_10orb_4{flex:none;color:var(--dsw-alias-label-secondary);animation:_spin_9gj4p_34 1s linear infinite}@media(prefers-reduced-motion:reduce){._matrix_10orb_4{animation:none}}'
  if (source.includes(replacement)) return

  const startNeedle = '._matrix_10orb_4{flex:none;color:var(--dsh-state-ongoing)}'
  const endNeedle = '._root_9cl6j_3'
  const start = source.indexOf(startNeedle)
  const end = source.indexOf(endNeedle, start)
  if (start < 0 || end < 0) throw new Error('Unable to find the running StateDot styles')

  source = source.slice(0, start) + replacement + source.slice(end)
  writeFileSync(path, source)
}

patchPrimitives(primitivesPath)
writeFileSync(primitivesPath, patchFigmaReadingTables(readFileSync(primitivesPath, 'utf8')))
patchJavaScript(asset('.js'))
writeFileSync(primitivesPath, patchFigmaMenuPlacement(patchFigmaMenuScope(readFileSync(primitivesPath, 'utf8'))))
writeFileSync(asset('.js'), patchFigmaMenuPlacement(patchFigmaMenuScope(patchFigmaReadingWeb(readFileSync(asset('.js'), 'utf8'), readFileSync(primitivesPath, 'utf8')), true), true))
patchStyles(asset('.css'))

// Restore just this patch before earlier passes update their exact anchors.
const gridConversationPath=join(process.cwd(),'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js')
// Unwind our outer action/restore records before lifecycle and grid refreshes.
const unTabbedConversationSource=stripBoardTabsClient(stripComposerVoice(readFileSync(gridConversationPath,'utf8')))
const submittedConversationSource=stripConversationResponseProgress(stripConversationSubmission(stripConversationHistoryClient(unTabbedConversationSource)))
writeFileSync(gridConversationPath,stripSidebarNewNoteConversation(stripPlainSlashInput(submittedConversationSource)))
const sidebarNewNotePath=join(process.cwd(),'node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js')
writeFileSync(sidebarNewNotePath,stripSidebarNewNoteShell(readFileSync(sidebarNewNotePath,'utf8')))
writeFileSync(gridConversationPath,restoreResearchGridWorkbench(stripHomeGuideNative(stripHomeGuidePresentationNative(stripPptxAnnotationInput(stripPptxAnnotationMessages(readFileSync(gridConversationPath,'utf8')))))))
await installResearchBoardClientPatches()

const conversationPath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js')
writeFileSync(conversationPath, patchResearchNativeWeb(patchCanvasCreationTools(patchFigmaRefinementConversation(patchFigmaCanvasGestures(patchConversationFileReference(patchFigmaInlineReferences(patchFigmaUpdateWorkspace(readFileSync(conversationPath, 'utf8')))))))))

const trajectoryPath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-ui-trajectory/lib/client.js')
writeFileSync(trajectoryPath, patchFigmaTrajectory(readFileSync(trajectoryPath, 'utf8')))

const layoutPath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js')
writeFileSync(layoutPath, patchFigmaFinalLayout(readFileSync(layoutPath, 'utf8')))

for (const [name, patch] of [
  ['dsh-client-locale', patchDesktopLocaleBridge],
  ['dsh-client-ui-user-questions', patchQuestionCountdown],
  ['dsh-client-ui-model-selection', patchFigmaModelMenu],
  ['dsh-client-ui-commands', patchSkillCommandPopup],
  ['dsh-client-ui-input-trigger', patchSkillCommandLabels],
  ['dsh-client-ui-permission-presets', source => patchFigmaPermissionMenu(source, true)],
  ['dsh-client-ui-workspace', source => patchWorkspaceDragFeedback(patchFigmaWorkspaceMenus(patchFigmaNavigationTitles(source)))],
  ['dsh-client-ui-sidebar', patchNewChatSidebar],
  ['dsh-client-ui-conversation', source => patchDesktopResearchDefaults(patchFigmaEnterDescription(patchFigmaContainerMenu(patchFigmaCanvasContextMenu(patchFigmaPermissionMenu(patchFigmaReadingConversation(patchFigmaContextDirectory(source)))))))],
  ['dsh-client-ui-settings-general', (source) => patchFigmaAboutUpdates(patchFigmaSettingsGeneral(source))],
  ['dsh-client-ui-settings-models', source => patchFigmaProviderMenu(patchFigmaSettingsModels(source))],
  ['dsh-client-ui-theme', source => patchHomeThemeAppearance(patchFigmaSettingsAppearance(source))],
  ['dsh-client-ui-agent-preset', source => patchFigmaSettingsModeDescription(patchFigmaRefinementPreset(patchFigmaSettingsPreset(source)))],
  ['dsh-client-ui-subagent', patchFigmaRefinementSubagent],
  ['dsh-client-ui-input-trigger', patchFigmaRefinementInputTrigger]
]) {
  const clientPath = join(process.cwd(), 'node_modules', '@deepseek-ai', name, 'lib/client.js')
  writeFileSync(clientPath, patch(readFileSync(clientPath, 'utf8')))
}

for (const [relative, patch] of [
  ['dsh-client-runtime/lib/client.js', source=>patchNewChatSessionRuntime(patchSessionListStreamPerformance(patchSubagentPanelRuntime(source)))],
  ['dsh-client-web-react/lib/index.js', patchSubagentPanelRenderer],
  ['dsh-client-ui-conversation/lib/client.js', source => patchResearchResidentConversation(patchSubagentPanelConversation(source))],
  ['dsh-client-ui-subagent/lib/client.js', patchSubagentPanelEntry]
]) {
  const path = join(process.cwd(), 'node_modules/@deepseek-ai', relative)
  writeFileSync(path, patch(readFileSync(path, 'utf8')))
}
writeFileSync(asset('.js'), patchSubagentPanelRenderer(readFileSync(asset('.js'), 'utf8'), true))

writeFileSync(conversationPath, patchInspectConversation(readFileSync(conversationPath, 'utf8')))
writeFileSync(layoutPath, patchInspectLayout(readFileSync(layoutPath, 'utf8')))

writeFileSync(conversationPath, patchGeneratedFilePreview(readFileSync(conversationPath, 'utf8')))
const deliverablesPath=join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js')
writeFileSync(deliverablesPath, patchGeneratedFileMentions(readFileSync(deliverablesPath, 'utf8')))

writeFileSync(conversationPath, patchRestoredFileMentions(readFileSync(conversationPath, 'utf8')))
writeFileSync(deliverablesPath, patchDeliverableCards(readFileSync(deliverablesPath, 'utf8')))
writeFileSync(conversationPath, patchDeliveryConversation(readFileSync(conversationPath, 'utf8')))

writeFileSync(conversationPath, patchEmptyHeaderTitles(readFileSync(conversationPath, 'utf8')))

writeFileSync(primitivesPath, patchMarkdownFileLinks(readFileSync(primitivesPath, 'utf8')))
writeFileSync(asset('.js'), patchMarkdownFileLinks(readFileSync(asset('.js'), 'utf8'), true))

writeFileSync(conversationPath, patchInspectPortal(readFileSync(conversationPath, 'utf8')))

writeFileSync(conversationPath, patchComponentWheelZoom(readFileSync(conversationPath, 'utf8')))

writeFileSync(conversationPath, patchCanvasActionsClient(readFileSync(conversationPath, 'utf8')))
writeFileSync(conversationPath, patchResearchCreationProgress(patchCanvasUseClient(readFileSync(conversationPath, 'utf8'))))
const subagentRuntimePath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js')
writeFileSync(subagentRuntimePath, patchCanvasTaskNotices(readFileSync(subagentRuntimePath, 'utf8')))

writeFileSync(conversationPath, patchCanvasRefresh(readFileSync(conversationPath, 'utf8')))

import { patchTaskProgressRuntime } from './lib/task-progress-runtime.mjs'
import { patchTodoRecovery, patchFileRecovery } from './lib/tool-recovery-guidance.mjs'
import { patchTaskProgressClient } from './lib/task-progress-client.mjs'
const todoRuntimePath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-tool-todo/lib/index.js')
writeFileSync(todoRuntimePath, patchTodoRecovery(patchTaskProgressRuntime(readFileSync(todoRuntimePath, 'utf8'))))
const fsRuntimePath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-tool-fs/lib/index.js')
writeFileSync(fsRuntimePath, patchFileRecovery(readFileSync(fsRuntimePath, 'utf8')))
writeFileSync(conversationPath, patchTaskProgressClient(readFileSync(conversationPath, 'utf8')))

// Dedicated new boards take their durable name from the first task, not an empty component.
{
  const path = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js')
  let source = readFileSync(path, 'utf8')
  const before = 'if (!research.engaged) continue;'
  const after = 'if (!research.engaged || window.localStorage.getItem("sherlock.research.intent-title.v1:" + id) === "true") continue;'
  if (!source.includes(after)) {
    if (!source.includes(before)) throw Error('Research intent title anchor missing')
    source = source.replace(before, after)
    writeFileSync(path, source)
  }
}

writeFileSync(conversationPath, patchConversationBrowser(readFileSync(conversationPath, 'utf8')))

writeFileSync(conversationPath, patchComponentScheduledTasks(readFileSync(conversationPath, 'utf8')))

writeFileSync(conversationPath, patchComponentDataRefresh(readFileSync(conversationPath, 'utf8')))
writeFileSync(conversationPath, patchResearchGridWorkbench(patchCalendarToolClient(patchFinancialWidgetClient(patchAttachmentClient(patchAudioClient(patchDerivedPresetClient(patchYoutubeClient(patchIframeClient(readFileSync(conversationPath, 'utf8'))))))))))

// Bind the owned note surface to the real native session after other patches.
const notesConversationPath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js')
writeFileSync(notesConversationPath, patchMemorySourceAnchors(patchNoteSessionClient(patchNotesComposer(patchNotesClient(readFileSync(notesConversationPath, 'utf8'))))))
writeFileSync(notesConversationPath, patchSessionViewPreferences(readFileSync(notesConversationPath, 'utf8')))
writeFileSync(notesConversationPath, patchAssistantReveal(readFileSync(notesConversationPath, 'utf8')))
writeFileSync(notesConversationPath, patchConversationThinkingStatus(readFileSync(notesConversationPath, 'utf8')))
const notesRuntimePath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js')
writeFileSync(notesRuntimePath, patchNoteSessionRuntime(readFileSync(notesRuntimePath, 'utf8')))
const modeClientPath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js')
writeFileSync(modeClientPath, patchStandardModeClient(readFileSync(modeClientPath, 'utf8')))
const modeRuntimePath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-agent-presets/lib/index.js')
writeFileSync(modeRuntimePath, patchStandardModeRuntime(readFileSync(modeRuntimePath, 'utf8')))

const noteHostPath = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js')
writeFileSync(noteHostPath, patchNoteForkHost(patchNoteSessionHost(readFileSync(noteHostPath, 'utf8'))))
const noteFeedbackPath=join(process.cwd(),'node_modules/@deepseek-ai/dsh-message-feedback/lib/index.js')
writeFileSync(noteFeedbackPath,patchNoteFeedbackHost(readFileSync(noteFeedbackPath,'utf8')))
for (const catalog of ['lib/index.js', 'lib/types/known-event-types.js']) {
  const path = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-session', catalog)
  writeFileSync(path, patchHomeGuideSessionCatalog(patchWorkbenchPlanningSessionCatalog(patchNoteSessionCatalog(readFileSync(path, 'utf8')))))
}
for (const runtime of ['lib/index.js', 'lib/types/index.js']) {
  const path = join(process.cwd(), 'node_modules/@deepseek-ai/dsh-session', runtime)
  writeFileSync(path, patchWorkbenchPlanningSessionAppend(readFileSync(path, 'utf8')))
}

// Input runtime helpers must survive the later native-component refreshes.
writeFileSync(conversationPath, patchComposerDeliverablePreview(readFileSync(conversationPath, 'utf8')))

// Tutorial portals use the final resident components, after all source refreshes.
writeFileSync(conversationPath, patchHomeGuidePresentationNative(patchHomeGuideNative(readFileSync(conversationPath, 'utf8'))))
// Reply components consume the final native renderers and input/reference helpers.
writeFileSync(conversationPath,patchConversationComponents(readFileSync(conversationPath,'utf8')))
// A completed compaction keeps its published key, even when no checkpoint was produced.
writeFileSync(conversationPath,patchConversationCompactionLifecycle(readFileSync(conversationPath,'utf8')))
// The input coordinator wraps the final native sink and Root after every other renderer/input pass.
writeFileSync(conversationPath,patchPptxAnnotationInput(readFileSync(conversationPath,'utf8')))
// Sent messages project only Main-verified marks after the native renderers are final.
writeFileSync(conversationPath,patchPptxAnnotationMessages(readFileSync(conversationPath,'utf8')))
// Normal new-Note actions use the final native stores; the rail keeps DOM/AX order.
writeFileSync(conversationPath,patchSidebarNewNoteConversation(readFileSync(conversationPath,'utf8')))
writeFileSync(sidebarNewNotePath,patchSidebarNewNoteShell(readFileSync(sidebarNewNotePath,'utf8')))
// Plain-command caret outcomes wrap the final native class and projected InputBar.
writeFileSync(conversationPath,patchPlainSlashInput(readFileSync(conversationPath,'utf8')))

// Read-only first-send projection and one native turn clock are the outermost layers.
writeFileSync(conversationPath,patchConversationHistoryClient(patchConversationSubmission(patchConversationResponseProgress(readFileSync(conversationPath,'utf8')))))
writeFileSync(historyRuntimeBundlePath,patchConversationHistoryRuntime(readFileSync(historyRuntimeBundlePath,'utf8')))
// Board tabs wrap the final resident canvas and reverse before all earlier passes.
writeFileSync(conversationPath,patchBoardTabsClient(readFileSync(conversationPath,'utf8')))
// Dictation wraps the final shared controlled InputBar and unwinds before all refreshes.
writeFileSync(conversationPath,patchComposerVoice(readFileSync(conversationPath,'utf8')))
