export function patchTaskProgressClient(source) {
  const marker = '/* sherlock:task-progress-lifecycle:v1 */'
  if (source.includes(marker)) return source
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Task progress UI anchor drifted: ' + before)
    source = source.replace(before, after)
  }
  replace('function TodoPanel({ todos, objective, t }) {', `function TodoPanel({ todos, objective, t, running = true }) {${marker}`)
  replace('function OdysseyTaskStatus({status}) {', 'function OdysseyTaskStatus({status,running=true}) {\n  if(!running && status==="in_progress") return react_jsx_runtime.jsx(PendingGlyph,{});')
  replace('jsx)(OdysseyTaskStatus, { status: item.status })', 'jsx)(OdysseyTaskStatus, { status: item.status, running })')
  replace('"completed" : "pending" })', '"completed" : "pending", running })')
  replace('children: t("todo.progress.total", { done: todos.filter(item => item.status === "completed").length, total: todos.length })', `children: running === false && todos.some(item=>item.status!=="completed") ? (document.documentElement.dataset.odysseyLocale==='en' ? 'Run ended · checklist needs review' : '本轮已结束 · 清单待核对') : t("todo.progress.total", { done: todos.filter(item => item.status === "completed").length, total: todos.length })`)
  replace('todos: useProjection("todos") ?? [],', 'todos: useProjection("todos") ?? [],\n                running: useSession(s=>s.running),')
  return source
}
