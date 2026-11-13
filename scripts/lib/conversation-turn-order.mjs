// A preparation context may be logged before the human in the same native
// Turn. Its execution group must not keep collecting replies above that human.
const edits = [
  ['const preserveProgressTurns = /* @__PURE__ */ new Set();', 'const preserveProgressTurns = /* @__PURE__ */ new Set();\n\t\t\t/* ework:conversation-turn-boundary:v1 */ const directUserTurns = new Set();'],
  ['entries.push({ kind: "node", key });\n\t\t\t\t\tif (node?.kind === "steering") {', `entries.push({ kind: "node", key });
\t\t\t\t\tif (node?.kind === "user") {
                        const turn = conversationNodeTurn(node);
                        if (turn !== null) {
                            const identity = String(turn), preparation = activeGroups.get(identity);
                            if (!directUserTurns.has(identity)) {
                                directUserTurns.add(identity);
                                // Keep this exact Turn's preparation and future activity
                                // together, after its first durable human. Other Turns
                                // and session-level history retain their positions.
                                if (preparation) {
                                    entries.splice(entries.indexOf(preparation), 1);
                                    entries.push(preparation);
                                }
                            } else {
                                preserveProgressTurns.add(identity);
                                activeGroups.delete(identity);
                            }
                        }
                    } else if (node?.kind === "steering") {`]
]
const marker = '/* ework:conversation-turn-boundary:v1 */'
const activityAnchor = 'if (!isExecutionDetailNode(node, closingSeqByTurn, promotedAssistantKeys)) {'
const activityMarker = '/* ework:conversation-permission-activity:v1 */'
const activityFilter = `${activityMarker}
                // Preset changes and approval notifications belong to the session log, not the Chat flow.
                if (node?.kind === "command" && node.data?.name === "permission" && node.data.args?.trim() &&
                    (node.data.outcome == null || node.data.outcome.kind === "success")) continue;
                if (node?.kind === "context" && node.data?.source?.kind === "plugin" &&
                    node.data.source.plugin === "user-approval") continue;
                ${activityAnchor}`
const count = (source, value) => source.split(value).length - 1
function change(source, inverse) {
  const start = source.indexOf('function compactConversationFlow('), end = source.indexOf('\n\t\t}', start)
  if (start < 0 || end < start || count(source, 'function compactConversationFlow(') !== 1) throw Error('Conversation turn boundary scope drifted')
  let scope = source.slice(start, end)
  const changes = inverse && !scope.includes(activityMarker) ? edits : [...edits, [activityAnchor, activityFilter]]
  for (const [before, after] of inverse ? [...changes].reverse() : changes) {
    const from = inverse ? after : before, to = inverse ? before : after
    if (count(scope, from) !== 1) throw Error('Conversation turn boundary anchor drifted')
    scope = scope.replace(from, to)
  }
  return source.slice(0, start) + scope + source.slice(end)
}
export function stripConversationTurnOrder(source) {
  if (!source.includes(marker)) {
    if (source.includes('ework:conversation-turn-boundary:') || source.includes('const directUserTurns = new Set();') || source.includes(activityMarker)) throw Error('Conversation turn boundary orphaned')
    return source
  }
  if (count(source, marker) !== 1) throw Error('Conversation turn boundary duplicated')
  return change(source, true)
}
export const patchConversationTurnOrder = source => change(stripConversationTurnOrder(source), false)
