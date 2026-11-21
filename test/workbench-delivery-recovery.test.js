import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, it, vi} from 'vitest';
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js';
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js';

it('mounts retained prepared snapshots after task rotation and isolates expired or invalid cards', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sherlock-retained-panels-'));
    const filePath = join(directory, 'plans.json');
    const runtime = new ResearchTaskRuntime({ adapter: {start:vi.fn()}, storage: { save: async () => {} } });
    const artifact = {version:1, type:'table', title:'基金产品净流入', columns:['渠道','净流入（万元）'], rows:[['直销','120']]};
    const prepared = {nodeId:'retained', taskId:'retired', prepared:true, artifact, deliveryStatus:'partial', recoveryMode:'incomplete-scope', unmetRequirements:['缺少代销数据']};
    const [current] = await runtime.startPreparedBatch({parentSessionId:'owner', panels:[{canvasNodeId:'new', prompt:'渠道日报', artifact}]});
    const plans = [
        {id:'old', parentSessionId:'owner', ready:true, dataMode:'simulated', panels:[prepared, {nodeId:'expired',taskId:'expired'}, {...prepared,nodeId:'bad',artifact:{type:'unknown'}}]},
        {id:'new', parentSessionId:'owner', ready:true, panels:[{...prepared, nodeId:'new', taskId:current.taskId}, {nodeId:'lost-analysis',taskId:'retired-analysis'}]},
        {id:'other', parentSessionId:'different', ready:true, panels:[prepared]}
    ];
    await writeFile(filePath, JSON.stringify(plans));
    let handler, status, response;
    const ctx = {tools:{register:()=>()=>{}}, webServer:{register:route=>{handler=route.handler;return ()=>{}}}};
    const dispose = await registerWorkbench(ctx, runtime, {filePath, isTrustedRequest:()=>true, readJsonBody:async()=>({parentSessionId:'owner'})});
    try {
        await handler({method:'POST'}, {writeHead:code=>{status=code},end:value=>{response=JSON.parse(value)}});
        expect(status).toBe(200);
        expect(response.plans.map(p=>p.id)).toEqual(['old','new']);
        const [snapshot,expired,bad] = response.plans[0].panels;
        expect(snapshot.preparedOutput).toBe(current.finalOutput);
        expect(snapshot.preparedDelivery).toMatchObject({deliveryStatus:'partial',unmetRequirements:['缺少代销数据']});
        for (const panel of [expired,bad]) {
            expect(panel.error).toContain('重试');
            expect(panel.taskId).toBeUndefined();
            expect(panel.preparedOutput).toBeUndefined();
        }
        expect(response.plans[1].panels[0].preparedOutput).toBe(current.finalOutput);
        const expiredAnalysis = response.plans[1].panels[1];
        expect(expiredAnalysis.taskId).toBeUndefined();
        expect(expiredAnalysis.error).toContain('重试');
        expect(runtime.tasks.size).toBe(1);
        expect(runtime.adapter.start).not.toHaveBeenCalled();
    } finally {
        await dispose();
        await runtime.dispose();
        await rm(directory, {recursive:true, force:true});
    }
});
it('dispatches independent source panels on failure and retries only the unstarted ones on the original plan', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sherlock-source-dispatch-'));
    const filePath = join(directory,'plans.json');
    let tool;
    const ctx = {agents:{get:()=>({})}, tools:{register:value=>{if(value.name==='research_workbench_create')tool=value;return ()=>{}}}, webServer:{register:()=>()=>{}}};
    const launch = vi.fn(async ({panels})=>panels.map(panel=>({taskId:panel.canvasNodeId})));
    const prepare = vi.fn().mockRejectedValueOnce(Error('temporary storage failure')).mockImplementation(launch.getMockImplementation());
    const dispose = await registerWorkbench(ctx,{startBatch:launch, startPreparedBatch:prepare},{filePath,isTrustedRequest:()=>true,readJsonBody:async()=>({})});
    try {
        const request = {requestId:'risk-week',title:'组合风险周报', panels:[
            {type:'table',title:'暴露核对',prompt:'根据给定的仓位核对行业暴露',artifact:{version:1,type:'table',title:'暴露核对',columns:['行业','组合仓位'],rows:[['消费','12%']]}},
            {type:'markdown',title:'周度变化',prompt:'查找本周政策原文并总结变化'}
        ]};
        const exec = {agent:{session:{id:'owner'}}};
        const first = await tool.execute(request,exec);
        expect(first.status).toBe('incomplete');
        expect(launch).toHaveBeenCalledTimes(1);
        const before = JSON.parse(await readFile(filePath,'utf8'))[0];
        expect(before.panels[0].error).toContain('重试');
        expect(before.panels[1].taskId).toBeTruthy();
        const retried = await tool.execute(request,exec);
        expect(retried).toMatchObject({status:'accepted',planId:first.planId});
        expect(launch).toHaveBeenCalledTimes(1);
        expect(prepare).toHaveBeenCalledTimes(2);
        const after = JSON.parse(await readFile(filePath,'utf8'))[0];
        expect(after.panels.map(panel=>panel.nodeId)).toEqual(before.panels.map(panel=>panel.nodeId));
        expect(after.panels.every(panel=>panel.taskId&&!panel.error)).toBe(true);
    } finally { await dispose(); await rm(directory,{recursive:true,force:true}); }
});
