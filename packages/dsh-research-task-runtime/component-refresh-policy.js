// Refresh intent comes from task instructions or a direct human request. Quoted
// examples and fetched documents must not silently change the saved frequency.
const instructions = text => typeof text === 'string'
  ? text.replace(/```[\s\S]*?```/gu, '').replace(/^\s*>.*$/gmu, '').replace(/[“「][^”」]*[”」]/gu, '')
  : '';
const manualDirective = '宿主刷新设置：仅手动刷新（intervalMinutes=0）；首次取数正常执行，之后由用户手动触发。';

export function requestedComponentRefreshInterval(text) {
  const request = instructions(text);
  if (request.includes(manualDirective)) return 0;
  if (/(?:不要|不用|不需要)\s*(?:仅|只)\s*手动/u.test(request)) return undefined;
  const manual = /(?:仅|只)\s*(?:允许|支持|使用|需要|能)?\s*手动(?:刷新|更新)?|(?:不要|不用|不需要|关闭|禁用)\s*自动(?:刷新|更新)|\b(?:manual[- ]only|manual refresh only|no automatic refresh)\b/iu.test(request);
  const automatic = /每\s*\d+\s*(?:分(?:钟)?|小时|天).*?(?:刷新|更新)|\bevery\s+\d+\s+(?:minutes?|hours?)\b/iu.test(request);
  return manual && !automatic ? 0 : undefined;
}

export function preserveWorkbenchRefreshPreference(args, humanText) {
  if (!args || args.dataMode === 'simulated' || !Array.isArray(args.panels)) return args;
  const interval = requestedComponentRefreshInterval(humanText);
  if (interval !== 0) return args;
  const request = instructions(humanText);
  // A request naming one card's setting is scoped. Each panel's own instruction
  // handles mixed settings; an explicit whole-board instruction may apply to all.
  if (args.panels.length > 1 && /第一|第二|第[一二三四五六七八九十\d]+(?:张|个)|其中|这张|这一个/u.test(request)
      && !/(?:全部|所有|每张|每个|整个工作台|所有组件).{0,16}(?:仅|只|不要|不用|关闭|禁用)/u.test(request)) return args;
  return { ...args, panels: args.panels.map(panel => ({ ...panel,
    ...(panel.publicData ? { publicData: { ...panel.publicData, intervalMinutes: 0 } } : {}),
    prompt: `${panel.prompt}\n${manualDirective}`
  })) };
}
