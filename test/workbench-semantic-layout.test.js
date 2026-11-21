import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {layoutWorkbench,validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {researchWorkbenchMatrixNodes,patchResearchWorkbenchGrowth} from '../scripts/lib/research-workbench-growth.mjs';
const panel=(type,title,layout)=>({type,title,prompt:'保留记录、筛选和详情',size:'large',...(layout?{layout}:{})});
const separated=nodes=>{for(const [i,a] of nodes.entries())for(const b of nodes.slice(i+1))expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true)};
it('places a resource schedule across the board and preserves supporting cards in a readable flow',()=>{
 const plan=validateWorkbench({requestId:'wide-schedule',title:'极夜出航',panels:[panel('gantt','资源排程'),panel('tasks','出航准备'),panel('alerts','应急预案'),panel('timeline','样本流转')]});
 const placed=layoutWorkbench(plan.panels);
 expect(placed[0].workbenchSpan).toBe(true);expect(placed[0].width).toBeGreaterThanOrEqual(980);
 expect(placed[1].y).toBeGreaterThanOrEqual(placed[0].height+16);expect(placed[2].y).toBe(placed[1].y);separated(placed);
 const grown=researchWorkbenchMatrixNodes(placed.map((p,i)=>({...p,id:'n'+i,workbenchIndex:i,width:i?656:980,height:i?340:780})),24,40);
 expect(grown[0].workbenchSpan).toBe(true);expect(grown[0].width).toBeGreaterThan(grown[1].width);
 expect(grown[1].y-grown[1].height/2).toBeGreaterThanOrEqual(grown[0].y+grown[0].height/2+16);
 separated(grown.map(n=>({...n,x:n.x-n.width/2,y:n.y-n.height/2})));
});
it('honors a semantic wide comparison without altering ordinary financial layouts or manual frames',()=>{
 const p=panel('html','联动分析','wide'),plan=validateWorkbench({requestId:'wide-detail',title:'自定义研究',panels:[p,panel('news','事件')]});
 expect(plan.panels[0].layout).toBe('wide');expect(layoutWorkbench(plan.panels)[0].workbenchSpan).toBe(true);
 expect(()=>validateWorkbench({requestId:'bad',title:'无效',panels:[{...p,layout:'random'}]})).toThrow();
 const legacy=layoutWorkbench([panel('market','指数行情'),panel('news','事件')]);expect(legacy[0].y).toBe(legacy[1].y);expect(legacy[0].workbenchSpan).not.toBe(true);
 expect(workbenchPanelPrompt(plan,plan.panels[0])).toContain('标题区');
});
it('ships the same wide placement and persistence contract through the actual client patch',()=>{
 // At runtime the grid wraps the growth viewport. Isolate only that call site
 // so this inner installer can be checked against the actual installed bytes.
 const sdk=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8');
 const before=sdk.replace('snapshot = researchWorkspaceSnapshot(workbenchGrid.reconcile(workbenchGrid.enabled()?next:researchWorkbenchGrowthViewport(snapshot,next)));',
  'snapshot = researchWorkspaceSnapshot(researchWorkbenchGrowthViewport(snapshot,next));');
 const patched=patchResearchWorkbenchGrowth(before);
 const helper=patched.match(/function workbenchLayoutFrames\([^]*?\n\}/u)[0];
 const start=patched.indexOf('function researchWorkbenchMatrixNodes('),end=patched.indexOf('function researchCanvasReflowGrowth(',start);
 const serialized=runInNewContext(helper+'\n'+patched.slice(start,end)+'\nresearchWorkbenchMatrixNodes');
 const nodes=[{id:'wide',workbenchSpan:true,workbenchLayoutVersion:1,width:980,height:500},{id:'a',workbenchIndex:1,width:656,height:340},{id:'b',workbenchIndex:2,width:656,height:340}];
 expect(serialized(nodes,24,40)).toEqual(researchWorkbenchMatrixNodes(nodes,24,40));
 expect(patched).toContain('workbenchLayoutVersion:p.workbenchLayoutVersion===1?1:undefined');expect(patched).toContain('workbenchLayoutVersion:value.workbenchLayoutVersion===1?1:undefined');
 expect(patchResearchWorkbenchGrowth(patched)).toBe(patched);
});
