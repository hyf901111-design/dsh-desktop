/** Files owns a file path; the conversation shell owns its native reference codec. */
function insertSidebarFileReference(ctx, sessionId, path) {
  try {
    const actx = ctx.sessions.scope(sessionId);
    const conversation = ctx.get("conversation");
    if (actx === void 0 || conversation === void 0) return false;
    const input = conversation.input.for(actx);
    if (typeof input.insertFilePaths !== "function") return false;
    // The input may live in a Research portal or beside a child composer.
    // Do not use a global first-textarea lookup or touch an unmounted session.
    const el = Array.from(document.querySelectorAll("textarea[data-odyssey-file-reference-session]"))
      .find(node => node.dataset.odysseyFileReferenceSession === sessionId && !node.disabled && !node.readOnly && !node.closest('[hidden],[aria-hidden="true"]'));
    if (!el) return false;
    const before = input.snapshot;
    const caret = input.insertFilePaths([path], {
      start: el.selectionStart, end: el.selectionEnd, draftRev: before.draftRev
    });
    if (!Number.isInteger(caret)) return false;
    const revision = input.snapshot.draftRev;
    const origin = document.activeElement;
    requestAnimationFrame(() => {
      if (!el.isConnected || el.disabled || el.readOnly || el.dataset.odysseyFileReferenceSession !== sessionId || input.snapshot.draftRev !== revision) return;
      if (document.activeElement !== origin && document.activeElement !== el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(caret, caret);
    });
    return true;
  } catch (error) {
    console.warn("[dsh-better-sidebar] file reference insert failed:", error);
    return false;
  }
}

function replaceOne(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Sidebar native file reference anchor drifted: ' + before.slice(0, 100));
  return source.replace(before, after);
}

export function patchSidebarFileReference(source) {
  const marker = '/* odyssey:sidebar-file-reference:v1 */';
  if (source.includes(marker)) return source;
  source = replaceOne(source,
    'appendToDraft(ctx, sessionId, `@${relativeTo(cwd ?? "", path)}`);',
    'insertSidebarFileReference(ctx, sessionId, path);');
  return replaceOne(source, 'function appendToDraft(ctx, sessionId, text) {',
    marker + '\n' + insertSidebarFileReference.toString() + '\n/* odyssey:sidebar-file-reference:end */\n\t\tfunction appendToDraft(ctx, sessionId, text) {');
}

export function patchConversationFileReference(source) {
  const marker = '/* odyssey:conversation-file-reference:v1 */';
  if (source.includes(marker)) return source;
  source = replaceOne(source, 'insertFilePaths(paths) {', 'insertFilePaths(paths, span) {\n                ' + marker);
  source = replaceOne(source, 'if (references.length === 0) return;\n\t\t\t\tconst initial = this.snapshot.draft;',
    `if (references.length === 0) return;
                // Files uses the same native reference and CAS transaction as the
                // picker. Optional span preserves the existing upload append path.
                if (span !== void 0) {
                    if (references.length !== 1) return null;
                    const before = this.snapshot;
                    if (!this.insertReference(references[0], span)) return null;
                    return span.end + this.snapshot.draft.length - before.draft.length;
                }
\t\t\t\tconst initial = this.snapshot.draft;`);
  return replaceOne(source, 'className: InputBar_module_css_default.input,',
    'className: InputBar_module_css_default.input,\n                                            "data-odyssey-file-reference-session": sessionId,');
}
