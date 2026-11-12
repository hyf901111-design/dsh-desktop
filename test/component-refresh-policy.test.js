import { it, expect, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestedComponentRefreshInterval, preserveWorkbenchRefreshPreference } from '../packages/dsh-research-task-runtime/component-refresh-policy.js';
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js';

it('recognizes explicit manual intent without treating quoted examples or mixed frequencies as global settings', () => {
  for (const text of ['设置仅手动刷新，失败保留旧数据', '不要自动更新', 'manual refresh only'])
    expect(requestedComponentRefreshInterval(text)).toBe(0);
  for (const text of ['保持默认设置', '不要仅手动刷新', '> 示例：仅手动刷新', '```\n仅手动刷新\n```', '“仅手动刷新”是说明中的示例', '第一张仅手动刷新，第二张每5分钟更新'])
    expect(requestedComponentRefreshInterval(text)).toBeUndefined();
  const args = { dataMode:'source', panels:[{prompt:'获取行情'}, {prompt:'获取资讯'}] };
  expect(preserveWorkbenchRefreshPreference(args, '第一张仅手动刷新')).toBe(args);
  expect(preserveWorkbenchRefreshPreference(args, '全部仅手动刷新').panels.every(p => requestedComponentRefreshInterval(p.prompt) === 0)).toBe(true);
  expect(args.panels[0].prompt).toBe('获取行情');
});

it('carries the direct human manual setting through a planner omission and an idempotent retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sherlock-refresh-policy-'));
  let tool;
  const ctx = { agents:{get:()=>({})}, tools:{register:t=>{tool=t;return()=>{};}}, webServer:{register:()=>()=>{}} };
  const start = vi.fn(async request => ({taskId:request.canvasNodeId}));
  const path = join(dir, 'plans.json');
  const dispose = await registerWorkbench(ctx, {start}, {filePath:path,isTrustedRequest:()=>true,readJsonBody:async()=>({})});
  const session = {id:'parent',events:[{type:'user/message',data:{id:'manual-public-quote',source:{kind:'user'},content:[{type:'text',text:'创建一个指数概览工作台，设置仅手动刷新，失败保留旧数据。'}]}}]};
  const args = {title:'指数概览',dataMode:'source',panels:[{title:'指数概览',type:'market',size:'medium',prompt:'使用通联获取最近交易日行情，variant: metrics。默认每1分钟刷新。'}]};
  try {
    const first = await tool.execute(args, {agent:{session}});
    expect((await tool.execute(args, {agent:{session}})).planId).toBe(first.planId);
    expect(start).toHaveBeenCalledOnce();
    expect(requestedComponentRefreshInterval(start.mock.calls[0][0].prompt)).toBe(0);
    expect(JSON.parse(await readFile(path, 'utf8'))[0].input.panels[0].prompt).toContain('intervalMinutes=0');
    expect(args.panels[0].prompt).not.toContain('宿主刷新设置');
  } finally { await dispose(); await rm(dir,{recursive:true,force:true}); }
});

it('retains the authored interval per named native card when the plan uses the wrong unit',()=>{
 const args={panels:[
  {title:'盘中报价',prompt:'报价，每60分钟自动刷新',library:{id:'builtin-indices',options:{refreshMinutes:60,refreshEnabled:true}}},
  {title:'个股行情',prompt:'行情，每2分钟自动刷新',library:{id:'builtin-quote',options:{refreshMinutes:2,refreshEnabled:true}}},
 ]}
 const request='创建行情工作台。「盘中报价」60秒自动刷新，允许暂停；「个股行情」仅手动刷新。'
 const result=preserveWorkbenchRefreshPreference(args,request)
 expect(result.panels.map(p=>p.library.options)).toEqual([{refreshMinutes:1,refreshEnabled:true},{refreshMinutes:0,refreshEnabled:false}])
 expect(result.panels.map(p=>requestedComponentRefreshInterval(p.prompt))).toEqual([1,0])
 expect(preserveWorkbenchRefreshPreference(args,'引用“每60秒自动刷新”作为示例。')).toBe(args)
 expect(args.panels[0].library.options.refreshMinutes).toBe(60)
})
