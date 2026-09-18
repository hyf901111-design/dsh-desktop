function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Tool recovery anchor drifted: ' + before.slice(0, 80))
  return source.replace(before, after)
}

// Preserve the schema and rejected call; supply a concrete repair instead of silently
// dropping fields or guessing which status the model meant.
export function withTodoRecovery(tool) {
  const example = 'Each todo has ONLY content and status. Example: {"todos":[{"content":"Read reference documents","status":"in_progress"}]}. pending, in_progress and completed are VALUES of status, not property names. Resend the COMPLETE list with the intended statuses; do not mark unfinished work completed.'
  const execute = tool.execute
  return {
    ...tool,
    description: tool.description + ' ' + example,
    async execute(args, exec) {
      try { return await execute(args, exec) }
      catch (error) {
        if (error?.code === 'INVALID_ARGS') error.message += ' — ' + example
        throw error
      }
    }
  }
}

export function patchTodoRecovery(source) {
  const marker = '/* sherlock:todo-recovery:v1 */'
  if (source.includes(marker)) return source
  source = replaceOnce(source, 'import { defineTool } from "@deepseek-ai/dsh-tools";', 'import { defineTool as defineBaseTool } from "@deepseek-ai/dsh-tools";')
  return source + '\n' + marker + '\n' + withTodoRecovery.toString() + '\nfunction defineTool(options) { return withTodoRecovery(defineBaseTool(options)); }\n'
}

export function patchFileRecovery(source) {
  const marker = '/* sherlock:file-recovery:v1 */'
  if (source.includes(marker)) return source
  source = replaceOnce(source,
    'unless you just created or edited it in this session.',
    'unless this same session just successfully used the write or edit TOOL on it. Files created, read, or modified through Bash, Python, another agent, or an earlier client run still require a fresh read tool call. After external changes, read again before editing. Never use shell writes to bypass this protection.')
  source = replaceOnce(source,
    'Create or fully replace a UTF-8 text file.',
    'Create or fully replace a UTF-8 text file. Before replacing any existing file (including generated reports), use the read tool in this session. Shell reads and another agent\'s reads do not satisfy this requirement.')
  source = replaceOnce(source,
    'Edit an existing UTF-8 text file by replacing literal text.',
    'Edit an existing UTF-8 text file by replacing literal text. First use the read tool in this session, including for files created by Bash or Python. Re-read after external changes.')
  source = replaceOnce(source,
    'FS_NOT_OBSERVED: "read the file, then retry"',
    'FS_NOT_OBSERVED: "No file was changed. Use the read TOOL on this exact path in the current session, inspect its content, then retry the intended edit/write. Bash/Python reads and other sessions do not count. Continue the task after recovery; do not bypass this guard with a shell overwrite"')
  source = replaceOnce(source,
    'FS_STALE_VERSION: "re-read the file, then retry"',
    'FS_STALE_VERSION: "No file was changed. The file changed since your observation. Use the read TOOL again, reconcile the latest content with your intended change, then retry. Do not blindly overwrite or bypass the guard"')
  return source + '\n' + marker + '\n'
}
