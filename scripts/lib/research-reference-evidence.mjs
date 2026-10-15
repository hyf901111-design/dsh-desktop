// Inline chips deliberately contain lightweight metadata. Resolve their IDs
// against the current workspace only when admitting the user's send.
export function patchResearchReferenceEvidence(source) {
  const marker = '/* odyssey:research-reference-evidence:v1 */'
  if (source.includes(marker)) return source
  const start = source.indexOf('\n\t\tfunction researchPromptArtifactsForSend(')
  const end = source.indexOf('\n\t\tfunction researchPromptFiles(', start)
  if (start < 0 || end < 0) throw Error('Research reference evidence anchor drifted')
  return source.slice(0, start) + `
        ${marker}
        function researchPromptArtifactsForSend(snapshot, references) {
            const liveArtifacts = new Map((snapshot?.artifacts ?? []).map(node => [node.id, node]));
            let remainingSourceText = RESEARCH_PROMPT_WEB_SOURCE_TEXT_MAX;
            const bounded = value => {
                const text = String(value ?? '').trim();
                const notice = '\\n[当前组件正文过长，以上证据已截断；不能把节选当作完整内容。]';
                return text.length <= RESEARCH_ARTIFACT_MAX_EXCERPT ? text : text.slice(0, RESEARCH_ARTIFACT_MAX_EXCERPT - notice.length) + notice;
            };
            return references.map(reference => {
                const live = liveArtifacts.get(reference.id);
                if (!live) return canonicalResearchArtifactReference({ ...reference, sourceText: undefined, excerpt: '[引用组件已移除或不可读取；本次没有当前正文，不能使用标签中的旧摘要或历史内容代替。]' });
                if (live.kind === 'web-link') {
                    if (remainingSourceText <= 0 || typeof live.sourceText !== 'string') return reference;
                    const sourceText = live.sourceText.slice(0, remainingSourceText);
                    const enriched = canonicalResearchArtifactReference({ ...reference, title: live.title, sourceText });
                    if (enriched === null) return reference;
                    remainingSourceText -= sourceText.length;
                    return enriched;
                }
                let evidence = live.excerpt;
                if (live.kind === 'generated-container') {
                    const spec = live.containerSpec;
                    evidence = spec && ['web', 'iframe'].includes(spec.type) ? live.sourceText : spec ? researchContainerPlainText(spec) : '';
                    if (spec && ['financial-widget', 'calendar-tool'].includes(spec.type)) evidence = '[当前引用只有组件配置元信息，未提供真实行情、新闻或事件正文；不能据此总结当前数据。]\\n' + (evidence || '');
                    const header = live.containerSpec && typeof researchComponentHeaderNote === 'function' ? researchComponentHeaderNote(live.containerSpec) : '';
                    if (header && evidence?.trim()) evidence = header + '\\n' + evidence;
                    if (!evidence?.trim()) evidence = '当前引用组件没有可读取的正文或尚未生成完成；不能仅凭标题、网址或历史对话推断内容。';
                    else if (live.refreshError || live.generationStatus !== 'completed') evidence = '[保留上次成功内容；当前刷新失败或尚未完成。]\\n' + evidence;
                } else if (['generated-summary', 'generated-mind-map'].includes(live.kind) && live.generationStatus !== 'completed') {
                    evidence = '当前引用组件尚未生成完成，没有可用正文。';
                }
                return canonicalResearchArtifactReference({ ...reference, kind: live.kind, title: live.title, excerpt: bounded(evidence) }) ?? reference;
            });
        }` + source.slice(end)
}
