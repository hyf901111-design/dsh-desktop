/** Bind only the exact durable native user input for this shared task attempt. */
export function sharedTaskNativeSlice(order, nodes, task) {
  if (!task?.conversation) return { keys: [], hasClosing: false }
  const localId = task.resumeCount ? `${task.taskId}:resume:${task.resumeCount}` : task.taskId
  const start = order.findIndex(key => nodes.get(key)?.kind === 'user' && nodes.get(key)?.id === `shared-board-task:${localId}`)
  if (start < 0) return { keys: [], hasClosing: false }
  const keys = []
  for (let i = start + 1; i < order.length; i++) {
    const node = nodes.get(order[i])
    if (node?.kind === 'user') break
    if (node && node.visibility !== 'hidden') keys.push(order[i])
  }
  return { keys, hasClosing: keys.some(key => !!nodes.get(key)?.data?.closing?.finalNode) }
}

// Inject these thin adapters into the existing conversation bundle. Rendering,
// streaming, tool details, markdown and final-message actions remain native.
function SharedResearchMessage({ message, nativeProps }) {
  const { t, openFile, loadImage } = nativeProps
  const node = { data: { content: [{ type: 'text', text: message.text ?? '' }], time: message.createdAt } }
  return react.createElement('div', { 'data-message-id': message.id, 'data-shared-native-message': message.role },
    react.createElement('small', { className: 'srb-native-author' }, message.author?.username ?? message.authorName ?? '成员'),
    message.role === 'user'
      ? react.createElement(UserMessageNodeView, { node, t, openFile, loadImage })
      : react.createElement(react.Fragment, null,
        react.createElement(AssistantMarkdown, { blocks: [{ kind: 'text', text: message.text ?? '' }], streaming: false, interrupted: false, openFile, loadImage, t }),
        react.createElement(MessageIconActions, { text: message.text ?? '', t })))
}
function SharedResearchRequest({ group, tasks, nativeProps }) {
  const { t, sharedSnapshot: { order, nodeStore, timeline, selectedCallId, cwd } } = nativeProps
  const task = tasks.filter(task => task.conversation).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).at(-1)
  const slice = react.useMemo(() => sharedTaskNativeSlice(order, nodeStore, task), [order, nodeStore, task?.taskId, task?.resumeCount])
  const running = task?.status === 'running'
  const runningTurn = running ? [...slice.keys].reverse().map(key => conversationNodeTurn(nodeStore.get(key))).find(turn => turn !== null) ?? null : null
  const flow = react.useMemo(() => compactConversationFlow(slice.keys, nodeStore, runningTurn), [slice, nodeStore, runningTurn])
  const seatProps = { ...nativeProps, selectedCallId, cwd }
  const nativeFinal = slice.hasClosing && task?.status !== 'failed' && task?.status !== 'interrupted'
  const request = group.rows.find(message => message.role === 'user')
  const replies = group.rows.filter(message => message !== request)
  return react.createElement('div', { 'data-shared-native-task': task?.taskId },
    request && react.createElement(SharedResearchMessage, { message: request, nativeProps }),
    ...flow.map(entry => {
      if (entry.kind === 'node') return react.createElement(ChatNodeSeat, { ...seatProps, nodeKey: entry.key, key: entry.key })
      const turn = entry.turn === null ? undefined : timeline.turns.get(entry.turn)
      return react.createElement(ExecutionStatusGroup, { key: entry.key, entry,
        activityNodes: entry.nodeKeys.map(key => nodeStore.get(key)).filter(Boolean),
        startTime: turn?.start?.time ?? task?.progress?.startedAt ?? null, endTime: turn?.end?.time ?? null, seatProps, t })
    }),
    running && !flow.length && react.createElement(ExecutionStatusGroup, { entry: { key: task.taskId, running: true, nodeKeys: [] }, activityNodes: [], startTime: task.progress?.startedAt ?? null, endTime: null, seatProps, t }),
    ...replies.filter(message => !nativeFinal || message.taskId !== task?.taskId).map(message => react.createElement(SharedResearchMessage, { key: message.id, message, nativeProps })))
}
function SharedResearchChatView(props) {
  if (!sherlockShared(props.sessionId) || !sherlockBoardsAdapter) return react.createElement(ChatView, props)
  return react.createElement(SharedResearchDiscussion, props)
}
function SharedResearchDiscussion(props) {
  const order = props.useSession(s => s.chat.order)
  const nodeStore = props.useSession(s => s.chat.nodes)
  const timeline = props.useSession(s => s.chat.timeline)
  const selectedCallId = props.useStore(s => s.selection?.callId)
  const cwd = props.useSessions(s => s.byId[props.sessionId]?.cwd)
  const nativeProps = react.useMemo(() => ({ ...props, sharedSnapshot: { order, nodeStore, timeline, selectedCallId, cwd } }), [props, order, nodeStore, timeline, selectedCallId, cwd])
  return react.createElement(sherlockBoardsPage.ResearchBoardDiscussion, {
    page: sherlockBoardsAdapter, sessionId: props.sessionId,
    MarkdownText: _deepseek_ai_dsh_client_ui_primitives.MarkdownText,
    NativeGroup: SharedResearchRequest, NativeMessage: SharedResearchMessage, nativeProps
  })
}
export function patchSharedNativeConversation(source) {
  const marker = '/* SHERLOCK_SHARED_NATIVE_CONVERSATION_V1 */'
  // Reuse the existing session slot's owner and injection context.
  source = source.replace('renderSlot("conversation.view", {}, { entryKey: "chat" }) : researchEmpty ?', 'sessionPresentation.conversationView : researchEmpty ?')
  if (source.includes(marker)) return source
  const old = 'sessionId !== void 0 && sherlockShared(sessionId) && sherlockBoardsAdapter ? (0, react_jsx_runtime.jsx)(sherlockBoardsPage.ResearchBoardDiscussion,{page:sherlockBoardsAdapter,sessionId,MarkdownText:_deepseek_ai_dsh_client_ui_primitives.MarkdownText}) : researchEmpty ?'
  if (!source.includes(old) || !source.includes('}, ChatView);')) throw Error('Native shared conversation anchor missing')
  source = source.replace(old, 'sessionId !== void 0 && sherlockShared(sessionId) && sherlockBoardsAdapter ? sessionPresentation.conversationView : researchEmpty ?')
  const adapter = [sharedTaskNativeSlice, SharedResearchMessage, SharedResearchRequest, SharedResearchChatView, SharedResearchDiscussion].map(fn => fn.toString()).join('\n')
  return source.replace('}, ChatView);', '}, SharedResearchChatView);').replace('function ChatView({', marker + '\n' + adapter + '\nfunction ChatView({')
}
