import { expandLiveWorkbenchPreset } from './live-workbench-presets.js';

// Refresh intent comes from task instructions or a direct human request. Quoted
// examples and fetched documents must not silently change the saved frequency.
const prose = text => typeof text === 'string'
  ? text.replace(/```[\s\S]*?```/gu, '').replace(/^\s*>.*$/gmu, '')
  : '';
const instructions = text => prose(text).replace(/[“「][^”」]*[”」]/gu, '');
const manualDirective = '宿主刷新设置：仅手动刷新（intervalMinutes=0）；首次取数正常执行，之后由用户手动触发。';

export function requestedComponentRefreshInterval(text) {
  const request = instructions(text);
  if (request.includes(manualDirective)) return 0;
  const hostInterval = /宿主刷新设置：每\d+分钟自动刷新（intervalMinutes=(\d+)）/u.exec(request)?.[1];
  if (hostInterval !== undefined) return Number(hostInterval);
  if (/(?:不要|不用|不需要)\s*(?:仅|只)\s*手动/u.test(request)) return undefined;
  const manual = /(?:仅|只)\s*(?:允许|支持|使用|需要|能)?\s*手动(?:刷新|更新)?|(?:不要|不用|不需要|关闭|禁用)\s*自动(?:刷新|更新)|\b(?:manual[- ]only|manual refresh only|no automatic refresh)\b/iu.test(request);
  const matches = [...request.matchAll(/(?<![\d.])(?:(?:每|间隔)\s*)?(\d{1,6})\s*(秒|分钟|分|小时|天)\s*(?:自动)?(?:刷新|更新)|每\s*(分钟|小时|天)\s*(?:自动)?(?:刷新|更新)/gu)]
    .filter(match => !/(?:不要|不用|不需要|不必|无需|禁止|避免|取消)\s*$/u.test(request.slice(Math.max(0,match.index-12),match.index)));
  if (manual) {
    const otherAutomatic = /每\s*\d+\s*(?:分(?:钟)?|小时|天)[^。；\n]*?(?:刷新|更新)|\bevery\s+\d+\s+(?:minutes?|hours?)\b/iu.test(request);
    return matches.length || otherAutomatic ? undefined : 0;
  }
  const minuteUnits = {分:1,分钟:1,小时:60,天:1440};
  const intervals = new Set(matches.map(([,number,unit,singular]) => {
    if (singular) return minuteUnits[singular];
    return unit==='秒' ? Number(number)/60 : Number(number)*minuteUnits[unit];
  }));
  const [interval] = intervals;
  return intervals.size===1 && Number.isInteger(interval) && interval>0 && interval<=10080 ? interval : undefined;
}

function configureRefresh(panel, interval) {
  const native = {refreshMinutes:interval,refreshEnabled:interval>0};
  const directive = interval===0 ? manualDirective : `宿主刷新设置：每${interval}分钟自动刷新（intervalMinutes=${interval}）。`;
  return { ...panel,
    ...(panel.publicData ? { publicData:{...panel.publicData,intervalMinutes:interval}, ...(Object.hasOwn(panel,'intervalMinutes')?{intervalMinutes:interval}:{}) } : {}),
    ...(panel.profile!==undefined&&panel.requests!==undefined ? {intervalMinutes:interval} : {}),
    ...(panel.library?.id&&panel.library.id!=='builtin-calendar' ? {library:{...panel.library,options:{...panel.library.options,...native}}} : {}),
    ...(panel.artifact?.type==='financial-widget' ? {artifact:{...panel.artifact,...native}} : {}),
    prompt: `${panel.prompt}\n${directive}`,
  };
}

export function preserveWorkbenchRefreshPreference(args, humanText) {
  args = expandLiveWorkbenchPreset(args);
  if (!args || args.dataMode === 'simulated' || !Array.isArray(args.panels)) return args;
  const request = prose(humanText);
  const named = [...request.matchAll(/[“「]([^”」\n]+)[”」]/gu)].flatMap(match=>{
    const indexes=args.panels.flatMap((panel,i)=>{
      const title=panel?.title;
      return typeof title==='string'&&
        (title===match[1]||title.startsWith(match[1])&&/^[（(:：·\s]/u.test(title.slice(match[1].length)))?[i]:[];
    });
    return indexes.length===1?[{index:indexes[0],start:match.index,end:match.index+match[0].length}]:[];
  });
  const global= named.length ? request.slice(0,named[0].start) : request;
  const interval=requestedComponentRefreshInterval(global);
  // A request naming one card's setting is scoped. Each panel's own instruction
  // handles mixed settings; an explicit whole-board instruction may apply to all.
  const scoped= args.panels.length>1 && /第一|第二|第[一二三四五六七八九十\d]+(?:张|个)|其中|这张|这一个/u.test(global)
      && !/(?:全部|所有|每张|每个|整个工作台|所有组件).{0,16}(?:仅|只|不要|不用|关闭|禁用|每|自动)/u.test(global);
  const settings=new Map();
  named.forEach(({index,end},i)=>{
    const local=requestedComponentRefreshInterval(request.slice(end,named[i+1]?.start));
    if(local!==undefined)settings.set(index,local);
  });
  if((scoped||interval===undefined)&&!settings.size)return args;
  return {...args,panels:args.panels.map((panel,index)=>{
    const setting=settings.get(index)??(scoped?undefined:interval);
    return setting===undefined?panel:configureRefresh(panel,setting);
  })};
}
