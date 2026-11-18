function researchPartialDeliveryFields(receipt) {
  const requirements = receipt?.unmetRequirements;
  if (receipt?.deliveryStatus !== 'partial' || !['source-snapshot', 'readable-content', 'incomplete-scope', 'data-missing'].includes(receipt.recoveryMode) ||
      !Array.isArray(requirements) || requirements.length < 1 || requirements.length > 16 ||
      requirements.some(text => typeof text !== 'string' || !text.trim() || text.length > 256)) return {};
  return { deliveryStatus: 'partial', recoveryMode: receipt.recoveryMode, unmetRequirements: [...requirements] };
}

function researchContainerDeliveryFields(spec, receipt, completedAt) {
  const delivery = researchPartialDeliveryFields(receipt);
  return {
    containerSpec: spec, generationCompletedAt: completedAt,
    ...(researchWorkbenchRecoveryMode({ ...delivery, containerSpec: spec }) ? delivery : { lastSuccessfulAt: completedAt })
  };
}

function ResearchPartialDeliveryNotice({ node, onRetry }) {
  const mode = researchWorkbenchRecoveryMode(node);
  if (!mode) return null;
  const english = document.documentElement.dataset.odysseyLocale === 'en';
  const labels = {
    'source-snapshot': ['已保留来源明细，原功能未完成', 'Source snapshot retained · original features incomplete'],
    'readable-content': ['已保留可读内容，原功能未完成', 'Readable content retained · original features incomplete'],
    'incomplete-scope': ['已生成部分内容，覆盖不完整', 'Partial content generated · coverage incomplete'],
    'data-missing': ['数据缺失，图表尚不可用', 'Data unavailable · chart incomplete']
  };
  const label = labels[mode][english ? 1 : 0];
  const { unmetRequirements = [] } = researchPartialDeliveryFields(node);
  const jsx = react_jsx_runtime.jsx, jsxs = react_jsx_runtime.jsxs;
  const retryable = isPartialWorkbenchNode(node) || ['failed', 'cancelled', 'interrupted'].includes(node.generationStatus);
  return jsxs('div', {
    className: 'rScV5Q_containerNotice', 'data-research-partial-delivery': mode,
    style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    onPointerDown: event => event.stopPropagation(),
    onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); },
    children: [
    unmetRequirements.length && mode !== 'data-missing' ? jsxs('details', { children: [
      jsx('summary', { style: { cursor: 'pointer' }, children: label }),
      jsx('ul', { style: { maxHeight: 96, overflow: 'auto', margin: '4px 0 0', paddingInlineStart: 18 },
        children: unmetRequirements.map((text, index) => jsx('li', { children: text }, index)) })
    ] }) : jsx('span', { children: label }),
    retryable && onRetry ? jsx('button', { type: 'button',
      style: { flexShrink: 0, color: 'inherit', background: 'transparent', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' },
      onClick: event => { event.stopPropagation(); onRetry(node); }, children: english ? 'Retry' : '重试'
    }) : null
    ]
  });
}

function ResearchDataFallbackContent({ node, children }) {
  const mode = researchWorkbenchRecoveryMode(node);
  if (!node.workbenchId || node.containerSpec.type !== 'markdown' || !['data-missing', 'readable-content'].includes(mode)) return children;
  const jsx = react_jsx_runtime.jsx, jsxs = react_jsx_runtime.jsxs;
  return jsxs('details', {
    'data-research-fallback-content': mode,
    style: { minHeight: 0, flex: 1, overflow: 'auto', paddingInline: 10, fontSize: 12 },
    onPointerDown: event => event.stopPropagation(),
    onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); },
    children: [jsx('summary', { style: { cursor: 'pointer' }, children: workbenchText(mode === 'data-missing' ? '查看缺数说明' : '查看保留的资料') }), children]
  });
}

export function patchResearchPartialDelivery(source) {
  const marker = '/* SHERLOCK_WORKBENCH_PARTIAL_DELIVERY_V2 */';
  if (source.includes(marker)) return source;
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('部分交付回执无法定位原生入口：' + before.slice(0, 90));
    source = source.replace(before, after);
  };
  const canonical = 'function canonicalResearchCanvasArtifactNode(value) {';
  const definitions = [researchPartialDeliveryFields, researchContainerDeliveryFields, ResearchPartialDeliveryNotice, ResearchDataFallbackContent].map(fn => fn.toString()).join('\n');
  const preview = '(0, react_jsx_runtime.jsx)(ResearchContainerContent, { node, sessionId, visible, officePreview, onHtmlSize, onUpgradeSize })';
  replace(preview, '(0, react_jsx_runtime.jsx)(ResearchDataFallbackContent, { node, children: ' + preview + ' })');
  const old = source.indexOf('/* SHERLOCK_WORKBENCH_PARTIAL_DELIVERY_V1 */');
  if (old >= 0) {
    const end = source.indexOf(canonical, old);
    if (end < 0) throw Error('部分交付回执升级入口缺失');
    return source.slice(0, old) + marker + '\n' + definitions + '\n' + source.slice(end);
  }
  replace(canonical, marker + '\n' + definitions + '\n' + canonical);
  replace('...(containerSpec === null ? {} : { containerSpec }),',
    '...(containerSpec === null ? {} : { containerSpec, ...researchPartialDeliveryFields(value) }),');
  replace('{containerSpec:parseResearchContainerSpec(p.preparedOutput),generationCompletedAt:Date.now(),lastSuccessfulAt:Date.now()}',
    'researchContainerDeliveryFields(parseResearchContainerSpec(p.preparedOutput),p.preparedDelivery ?? p,Date.now())');
  replace("state: 'completed', lastSeq: 1, events: [], finalOutput: panel.preparedOutput",
    "state: 'completed', lastSeq: 1, events: [], finalOutput: panel.preparedOutput, ...researchPartialDeliveryFields(panel.preparedDelivery ?? panel)");
  const fullResult = 'next = {\n\t\t\t\t\t\t\t\t...completed,\n\t\t\t\t\t\t\t\ttitle: spec.title,';
  replace(fullResult, 'const { deliveryStatus: _delivery, recoveryMode: _mode, unmetRequirements: _requirements, ...replacement } = completed;\n\t\t\t\t\t\t\t' + fullResult.replace('...completed', '...replacement'));
  replace('\n\t\t\t\t\t\t\t\tcontainerSpec: spec,\n', '\n');
  replace('generationCompletedAt: completedAt,\n\t\t\t\t\t\t\t\tlastSuccessfulAt: completedAt', '...researchContainerDeliveryFields(spec, inspection, completedAt)');
  replace('onCancelEdit, onSubmitEdit }) {', 'onCancelEdit, onSubmitEdit, onRetry }) {');
  replace('children: [activeGeneration ? (0, react_jsx_runtime.jsx)("div", { className: "rScV5Q_containerNotice",',
    'children: [(0, react_jsx_runtime.jsx)(ResearchPartialDeliveryNotice, { node, onRetry }), activeGeneration ? (0, react_jsx_runtime.jsx)("div", { className: "rScV5Q_containerNotice",');
  replace('onGenerate: onSubmitContainer, onUpgradeSize:onExpandGeneration,',
    'onGenerate: onSubmitContainer, onRetry: readOnly || retryDisabled ? undefined : onRetryGeneration, onUpgradeSize:onExpandGeneration,');
  return source;
}
