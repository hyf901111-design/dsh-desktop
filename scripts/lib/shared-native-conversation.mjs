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
function SharedResearchMessage({ message, nativeProps, ongoing=false }) {
  const { t, openFile, loadImage } = nativeProps
  const self = message.role === 'user' && !!nativeProps.currentUserId && (message.author?.userId ?? message.authorId) === nativeProps.currentUserId
  const author = message.author?.username ?? message.authorName ?? '成员'
  return react.createElement('div', { 'data-message-id': message.id, 'data-shared-native-message': message.role, 'data-self': self },
    react.createElement('small', { className: 'srb-native-author' }, message.role === 'assistant' ? author + '的智能助理' : author),
    message.role === 'user'
      ? react.createElement(UserStyleBubble, { content: [{ type:'text', text:message.text ?? '' }], t, openFile, imageLoader:loadImage, actions:text=>react.createElement(MessageIconActions, { text, time:message.createdAt, clock:self?'start':'end', t }) })
      : react.createElement(react.Fragment, null,
        react.createElement(AssistantMarkdown, { blocks: [{ kind: 'text', text: message.text ?? '' }], streaming: false, interrupted: false, openFile, loadImage, t }),
        !ongoing&&react.createElement(MessageIconActions, { text: message.text ?? '', t })))
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
  const nextRequest=sherlockBoardsAdapter?.getView(nativeProps.sessionId)?.messages?.filter(m=>m.role==='user'&&m.createdAt>request?.createdAt).sort((a,b)=>a.createdAt-b.createdAt)[0]

  const canvasTasks=typeof useAllCanvasTasks==='function'?useAllCanvasTasks(nativeProps.sessionId):[]
  const continuations=canvasTasks.filter(t=>request&&(t.resumedAt??t.createdAt)>=request.createdAt&&(t.resumedAt??t.createdAt)<(nextRequest?.createdAt??Infinity))
  const continued=typeof continueCanvasTaskFlow==='function'?continueCanvasTaskFlow(flow,nodeStore,continuations):flow
  const reports=continued.filter(e=>e.kind==='canvas-task'),tails=continued.filter(e=>e.kind==='node'&&nodeStore.get(e.key)?.kind==='turn-tail')
  const body=continued.filter(e=>!reports.includes(e)&&!tails.includes(e))
  const ongoing=continuations.some(t=>['running','waiting'].includes(t.state))
  return react.createElement('div', { 'data-shared-native-task': task?.taskId },
    request && react.createElement(SharedResearchMessage, { message: request, nativeProps }),
    (flow.length > 0 || running) && react.createElement('small', { className:'srb-native-author', 'data-shared-agent-author':true }, (request?.author?.username ?? request?.authorName ?? '成员') + '的智能助理'),
    ...body.map(entry => {
      if (entry.kind === 'node') return react.createElement(ChatNodeSeat, { ...seatProps, nodeKey: entry.key, key: entry.key })
      const turn = entry.turn === null ? undefined : timeline.turns.get(entry.turn)
      return react.createElement(ExecutionStatusGroup, { key: entry.key, entry,
        activityNodes: entry.nodeKeys.map(key => nodeStore.get(key)).filter(Boolean),
        startTime: turn?.start?.time ?? task?.progress?.startedAt ?? null, endTime: turn?.end?.time ?? null, seatProps, t })
    }),
    running && !flow.length && react.createElement('div', {'data-shared-progress':true,role:'status'},
      react.createElement('small',null,'正在执行'),
      ...(task.progress?.events??[]).map((event,index)=>event.type==='assistant-delta'
        ? react.createElement(AssistantMarkdown,{key:index,blocks:[{kind:'text',text:event.text??''}],streaming:false,interrupted:false,openFile:nativeProps.openFile,loadImage:nativeProps.loadImage,t})
        : react.createElement('div',{key:index},event.type==='tool-started'?(event.tool||'处理资料')+(event.detail?' · '+event.detail:''):event.failed?'工具执行未成功，正在处理':'工具执行完成')),
      !task.progress?.events?.length&&react.createElement('span',null,'等待执行者同步进度…')),
    ...replies.filter(message => !nativeFinal || message.taskId !== task?.taskId).map(message => react.createElement(SharedResearchMessage, { key: message.id, message, nativeProps, ongoing:continuations.length>0 })),
    ...reports.map(entry=>react.createElement(CanvasUseTaskMessage,{key:entry.key,task:entry.task,showExecution:entry.showExecution,t})),
    ...tails.map(entry=>react.createElement(ChatNodeSeat,{...seatProps,nodeKey:entry.key,key:entry.key})),
    !ongoing&&continuations.length>0&&!tails.length&&react.createElement(MessageIconActions,{text:continuations.at(-1).reason??'',t}))
}
function SharedResearchChatView(props) {
  if (!sherlockShared(props.sessionId) || !sherlockBoardsAdapter) return react.createElement(ChatView, props)
  return react.createElement(SharedResearchDiscussion, props)
}
function SharedResearchDiscussion(props) {
  const order = props.useSession(s => s.chat.order)
  const nodeStore = props.useSession(s => s.chat.nodes)
  const timeline = props.useSession(s => s.chat.timeline)
  const openState = props.useSession(s => s.openState)
  const revealLedger=typeof eworkAssistantRevealLedger==='undefined'?undefined:eworkAssistantRevealLedger
  revealLedger?.observe(props.useSession,openState,order,nodeStore)
  react.useLayoutEffect(()=>()=>revealLedger?.suspend(props.useSession),[props.useSession])
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
  if (source.includes(marker)) {
    const start = source.indexOf('function sharedTaskNativeSlice(', source.indexOf(marker));
    const end = source.indexOf('function ChatView({', start);
    if(start < 0 || end < start) throw Error('Shared native adapter boundary missing');
    return source.slice(0,start) + [sharedTaskNativeSlice, SharedResearchMessage, SharedResearchRequest, SharedResearchChatView, SharedResearchDiscussion].map(fn=>fn.toString()).join('\n') + '\n' + source.slice(end);
  }
  const old = 'sessionId !== void 0 && sherlockShared(sessionId) && sherlockBoardsAdapter ? (0, react_jsx_runtime.jsx)(sherlockBoardsPage.ResearchBoardDiscussion,{page:sherlockBoardsAdapter,sessionId,MarkdownText:_deepseek_ai_dsh_client_ui_primitives.MarkdownText}) : researchEmpty ?'
  if (!source.includes(old) || !source.includes('}, ChatView);')) throw Error('Native shared conversation anchor missing')
  source = source.replace(old, 'sessionId !== void 0 && sherlockShared(sessionId) && sherlockBoardsAdapter ? sessionPresentation.conversationView : researchEmpty ?')
  const adapter = [sharedTaskNativeSlice, SharedResearchMessage, SharedResearchRequest, SharedResearchChatView, SharedResearchDiscussion].map(fn => fn.toString()).join('\n')
  return source.replace('}, ChatView);', '}, SharedResearchChatView);').replace('function ChatView({', marker + '\n' + adapter + '\nfunction ChatView({')
}
