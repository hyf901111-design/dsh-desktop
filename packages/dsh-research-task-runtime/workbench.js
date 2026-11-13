import {workbenchRequestedStyle} from './workbench-request-style.js';
import {WORKBENCH_LIBRARY_GUIDANCE,WORKBENCH_LIBRARY_IDS,bindWorkbenchLibraryLinks} from './workbench-library.js';
import {workbenchExplicitScope,usesHumanSourceScope} from './workbench-explicit-scope.js';
import {workbenchSourcePolicy,workbenchObservedSourcesForPolicy} from './workbench-source-policy.js';
import {captureWorkbenchObservedSources} from './workbench-observed-sources.js';
import {compileObservedSourceView, observedSourceViews, OBSERVED_SOURCE_GUIDANCE, OBSERVED_SOURCE_VIEW_SCHEMA, OBSERVED_SOURCES_TOOL} from './workbench-source-views.js';
import {assertPrivateResearchSession} from './board-runtime.js'
import { createHash, randomUUID } from 'node:crypto';
import { canvasHumanRequest } from './canvas-task-routing.js';
import { workbenchCreationRequest, planningDataIntent, workbenchOfflineRequest, workbenchNeedsInlineBinding } from './workbench-execution-policy.js';
import {workbenchRequestImages} from './workbench-image-evidence.js';
import {workbenchDocumentInputs,workbenchDocumentScope,workbenchDocumentCitationIssue,workbenchDocumentSourceUrlIssue,documentUncertaintyIssue,documentTableEntityCoverageIssue} from './workbench-document-evidence.js';
import {delimitedTableIntegrityIssue,resolveDelimitedDatasetReferences} from './delimited-evidence.js';
import {acceptArtifactOutput} from './artifact-output.js';
import {COMPONENT_CONTENT_GUIDANCE} from './component-content.js';
import {workbenchSourceText} from './workbench-prototype-evidence.js';
import {resolveWorkbenchPrototypeTables} from './workbench-prototype-tables.js';
import {completeWordOrganizationPanels,completeWordReadingPanel,resolveWordDocumentGrids} from './workbench-word-grid.js';
import {matchesDatasetViewScope} from './dataset-view-runtime.js';
import { preserveWorkbenchRefreshPreference } from './component-refresh-policy.js';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const WORKBENCH_PATH = '/sherlock/research-workbenches/list';
import {validateWorkbench, layoutWorkbench, workbenchPanelPrompt, workbenchQuantityDeclarations, workbenchQuoteSourceRequests, workbenchScopeDeficits, WORKBENCH_PANEL_TYPES as types} from './workbench-plan.js';
import {preparedReleaseCohortIssue} from './observed-dated-feed.js';
import {SIMULATED_WORKBENCH_PRESETS} from './simulated-workbench-presets.js';
import {LIVE_WORKBENCH_PRESETS} from './live-workbench-presets.js';
import {generateSimulatedPanel} from './simulated-workbench-generator.js';
import {marketVariant} from './workbench-design-contract.js';
import { PUBLIC_DATA_PROFILES } from './workbench-public-data.js';
import {DATASET_HIERARCHY_SCHEMA,DATASET_VIEW_GUIDANCE,DATASET_VIEW_SCHEMA,WORKBENCH_DATASETS_SCHEMA,assertWorkbenchViewSources} from './dataset-view-contract.js';
import {acquireFundComparison,fundComparisonArtifacts,fundComparisonCount,fundComparisonReader,prepareFundComparisonOverview} from './workbench-fund-comparison.js';
export {validateWorkbench, layoutWorkbench, PANEL_SIZES} from './workbench-plan.js';
export function listWorkbenchObservedSources(session,messageId,schemas) {
    return observedSourceViews(captureWorkbenchObservedSources({session,messageId,schemas,onRejected:()=>{}}));
}
const publicDataRequestsSchema = { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    source: { type: 'string', required: true, enum: ['tencent-quotes','tencent-history','kraken-ticker','kraken-candles','sina-news'] },
    parameters_json: { type: 'string', required: true, description: '原来源参数JSON字符串。腾讯报价symbols数组每请求1–12个，超限分面板；例如 {"symbols":["sh510300"]}。Kraken pair:XBTUSD或ETHUSD，分钟图interval:1,limit:60；腾讯历史symbol:sh510300,limit:20（日线）；新浪limit:12。证券交易所必须确认，不猜后缀。' }
} } };
const refreshReceipt = () => ({refreshStatus:'unverified',refreshGuidance:'刷新配置待确认；以实际绑定及成功刷新状态为准，不能由计划承诺自动刷新已生效。'});
const preparedWorkbench = input => input.dataMode === 'simulated' && input.generationMode !== 'deferred' || input.panels.every(p => p.artifact);
const incompleteWorkbench=plan=>plan.sharedComparisonError||plan.scopeDeficits?.length||plan.panels.some(panel=>panel.deliveryStatus==='partial'||panel.error);
const partialDelivery=task=>task.deliveryStatus==='partial'?{deliveryStatus:'partial',recoveryMode:task.recoveryMode,unmetRequirements:task.unmetRequirements}:undefined;
function workbenchReceiptDetail(plan) {
    const scopeDetail = plan.sharedComparisonError || plan.scopeDeficits?.map(scopeDeficitText).join('\n');
    const failed = plan.panels.filter(panel=>panel.error).map(panel=>`「${panel.title}」${panel.error}`).join('\n');
    const detail = [scopeDetail, failed, plan.sourceCaptureWarning].filter(Boolean).join('\n');
    return detail ? {detail} : {};
}
const scopeDeficitText = issue => issue.message ?? `「${issue.panel}」要求${issue.expected}${issue.unit}${issue.entity}，${issue.actual===null?'实际数量尚无法核验':`实际交付${issue.actual}，尚缺${issue.missing}`}。`;
function validateWorkbenchDelivery(value, options){
    try{return {input:validateWorkbench(value, options),scopeDeficits:[]};}
    catch(error){
        if(error?.code!=='WORKBENCH_SCOPE_INCOMPLETE'||!error.partialPlan||!Array.isArray(error.scopeDeficits)||!error.scopeDeficits.length)throw error;
        return {input:error.partialPlan,scopeDeficits:error.scopeDeficits};
    }
}
function prepareLegacySimulation(input, canDefer) {
    const original = input.originalRequest ?? '';
    const authoredValues = /[|｜]\s*[+-]?\d|[（(]\s*[+-]?\d+(?:\.\d+)?\s*[，,]\s*[+-]?\d+|(?<![\d-])[+−-]\d+(?:\.\d+)?\s*(?:[、，。；]|万元|亿元|%)/u.test(original) ||
        (original.match(/\d+(?:\.\d+)?\s*(?:万元|亿元|元|百分比|%|GWh|手)/giu)?.length??0)>=3;
    if (authoredValues) {
        const titles = input.panels.filter(panel=>!panel.artifact).map(panel=>panel.title).join('、');
        throw Error(`面板「${titles}」缺少用户提供的数据。保留本轮原始数值、符号、单位和来源，在对应 artifact 或 content 填写完整数据后重试。不要用固定模板样例替代用户记录。`);
    }
    let prepared, failure;
    try {
        prepared = validateWorkbenchDelivery({...input, generationMode:undefined,
            panels:input.panels.map(panel=>generateSimulatedPanel(panel,input.title))});
    } catch (error) { failure = error; }
    if (prepared && !prepared.scopeDeficits.length) return prepared;
    const requirements = [input.originalRequest, ...input.panels.map(panel=>panel.prompt)].filter(Boolean).join('\n');
    const quantityBearing = prepared?.scopeDeficits.length || workbenchQuantityDeclarations(requirements).length;
    if (quantityBearing && canDefer && input.originalRequest && input.panels.length === 1) {
        try { return validateWorkbenchDelivery({...input,generationMode:'deferred'}); }
        catch (error) { if (!prepared) throw error; }
    }
    if (quantityBearing && input.panels.length > 1 && !input.sharedDatasets && /一致|同一批|同一份|同一数据集|同一组|共用|共享|\bsame (?:records|dataset|cohort)\b/iu.test(requirements)) {
        const detail = prepared?.scopeDeficits.map(scopeDeficitText).join('\n');
        throw Error(['固定样例无法覆盖本工作台。请保持 dataMode:"simulated"，先准备同一份完整模拟记录集，再用 sharedDatasets 和 view 生成明细、统计及筛选；已有有效内容一并保留。',detail].filter(Boolean).join('\n'));
    }
    if (prepared) return prepared;
    throw failure;
}
function normalizePanelNotes(args) {
    if (!Array.isArray(args?.panels) || !args.panels.some(panel=>panel?.note!==undefined)) return args;
    return {...args,panels:args.panels.map(panel=>{
        if (panel?.note === undefined) return panel;
        const {note,...rest} = panel;
        if (typeof note !== 'string' || note.length > 2000) throw Error('面板附注必须为 2000 字以内的文字。');
        return typeof rest.prompt === 'string' && note.trim()
            ? {...rest,prompt:`${rest.prompt}\n> 补充说明（规划文字，以实际来源和正文为准）：${note.trim().replace(/\n/g, '\n> ')}`}
            : rest;
    })};
}
function useArtifactPanelTitles(args) {
    if (!Array.isArray(args?.panels)) return args;
    return {...args,panels:args.panels.map(panel=>{
        if (!panel || panel.title !== undefined) return panel;
        const title = panel.content?.title ?? panel.artifact?.title;
        if (typeof title !== 'string' || !title.trim()) throw Error('每张卡需要标题。填写 panel.title，或在已取得的内容中填写 content.title 或 artifact.title。');
        return {...panel,title};
    })};
}
const workbenchDraftHash = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');
function recoverPreparedPanels(input, issues, {addGuidance = false} = {}) {
    const panels = input.panels.map(panel => {
        if (!issues.has(panel)) return panel;
        const {artifact, view, hierarchy, ...pending} = panel;
        if (addGuidance) {
            const issue = issues.get(panel);
            const remaining = 5000 - pending.prompt.length - 1;
            if (remaining > 0 && issue.length <= remaining) pending.prompt += '\n' + issue;
        }
        return view && panel.type==='view' ? {...pending, type:'table'} : pending;
    });
    const {sharedDatasets, sharedContext, ...plan} = input;
    // A view checks its full underlying dataset, including hidden records.
    // Only snapshots retained by verified views may reach the recovered plan.
    const used = new Set(panels.flatMap(panel => panel.view ? [panel.view.dataset] : []));
    const verifiedDatasets = sharedDatasets?.filter(dataset => used.has(dataset.id));
    return {...plan, panels, ...(verifiedDatasets?.length ? {sharedDatasets:verifiedDatasets} : {})};
}
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const templateIds = panels => panels.map(panel => panel.type==='financial-widget'?'financial-widget.'+panel.artifact?.widget:panel.type === 'market'
    ? `market.${panel.artifact?.variant ?? marketVariant(panel) ?? 'unspecified'}`
    : panel.type === 'chart' ? `chart.${panel.artifact?.variant ?? 'unspecified'}` : panel.type);
// Only a host-started, leased board child can register this in-process sink.
// Planning captures validated data; cloud writes still require current edit authority.
const sharedPlans = new Map();
export function captureSharedWorkbenchPlan(sessionId, accept) {
    if (sharedPlans.has(sessionId)) throw Error('PLANNER_ALREADY_REGISTERED');
    sharedPlans.set(sessionId, accept);
    return () => { if (sharedPlans.get(sessionId) === accept) sharedPlans.delete(sessionId); };
}
export async function registerWorkbench(ctx, runtime, { filePath, isTrustedRequest, readJsonBody, readDocumentEvidence }) {
    let plans = [];
    try {
        plans = JSON.parse(await readFile(filePath, 'utf8'));
        if (!Array.isArray(plans))
            throw Error('工作台存储无效');
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            throw e;
    }
    for (const p of plans)
        if (!p.ready) {
            p.ready = true;
            for (const panel of p.panels)
                if (!panel.taskId) {
                    const task = [...(runtime.tasks?.values() ?? [])].find(t => t.parentSessionId === p.parentSessionId && t.canvasNodeId === panel.nodeId);
                    if (task)
                        panel.taskId = task.taskId;
                    else
                        panel.error = '任务启动时中断，请重试。';
                }
        }
    // Planned cards exist before acquisition finishes and child tasks start.
    // Expose that lifecycle to the canvas instead of treating it as an orphan.
    const inspectPendingGeneration = (parentSessionId, canvasNodeId) => {
        const plan = plans.find(p => p.parentSessionId === parentSessionId && !p.ready && p.panels.some(panel => panel.nodeId === canvasNodeId && !panel.error));
        return plan ? { canvasNodeId, state: 'queued', pending: true, planId: plan.id, createdAt: plan.createdAt, lastSeq: 0, events: [] } : undefined;
    };
    runtime.inspectPendingGeneration = inspectPendingGeneration;
    let chain = Promise.resolve();
    const mountWaiters = new Map();
    const mountedPlans = new Set();
    const waitForCanvas = (id) => new Promise(resolve => {
        if (mountedPlans.delete(id)) return resolve();
        const timer = setTimeout(() => { mountWaiters.delete(id); resolve(); }, 1800);
        mountWaiters.set(id, () => { clearTimeout(timer); mountWaiters.delete(id); mountedPlans.delete(id); resolve(); });
    });
    const persist = async () => {
        await mkdir(dirname(filePath), { recursive: true });
        const tmp = `${filePath}.${randomUUID()}.tmp`;
        await writeFile(tmp, JSON.stringify(plans), 'utf8');
        await rename(tmp, filePath);
    };
    const create = (args, exec) => {
        args = normalizePanelNotes(useArtifactPanelTitles(args));
        // Snapshot the current authored creation before queueing or canvas mounting.
        // A later status question and unrelated chat memory cannot replace this scope.
        const originalHumanRequest = workbenchCreationRequest(exec.agent?.session);
        const originalRequest = originalHumanRequest && workbenchSourceText(exec.agent.session, originalHumanRequest);
        if(!originalHumanRequest&&args.sharedDatasets?.some?.(dataset=>dataset?.pastedTable!==undefined))
            throw Error('原始表格只能引用本轮用户消息。');
        const comparisonReferenceTime = new Date();
        const originalImageMessageId = originalHumanRequest?.messageId && workbenchRequestImages(exec.agent?.session, originalHumanRequest.messageId).length ? originalHumanRequest.messageId : undefined;
        if (originalRequest && planningDataIntent(originalRequest).sourceOnly && args?.dataMode === 'simulated')
            throw Error('用户要求真实数据，不能降级为模拟模式。保持dataMode:"source"；省略未取得的artifact及不匹配的publicData，只提交原需求的title/prompt/type/size，由独立面板真实取数，缺失如实标注。');
        if (originalRequest) args = { ...args, originalRequest };
        else if (args?.generationMode !== 'deferred' && args?.originalRequest !== undefined) {
            const { originalRequest, ...plan } = args;
            args = plan;
        }
        const documentPaths=originalRequest && args?.dataMode !== 'simulated' && workbenchDocumentInputs(originalRequest);
        const documentExclusive=Boolean(documentPaths&&workbenchDocumentScope(originalRequest));
        let documentEvidence;
        const getDocuments=()=>{
            if(!documentPaths||typeof readDocumentEvidence!=='function')
                throw Error('原文校验服务不可用；附件表格必须来自本轮附件。');
            return documentEvidence??=readDocumentEvidence(exec.agent.session,documentPaths,exec.signal);
        };
        const resolveSourceTables=async value=>{
            if(!Array.isArray(value.sharedDatasets))return value;
            const hasSourceTable=value.sharedDatasets.some(dataset=>dataset&&Object.hasOwn(dataset,'sourceTable'));
            const hasWordGrid=value.sharedDatasets.some(dataset=>dataset?.documentGrid!==undefined);
            const citedRecords=dataset=>documentExclusive&&Array.isArray(dataset?.records)&&typeof dataset.note==='string';
            if(!hasSourceTable&&!hasWordGrid&&!value.sharedDatasets.some(citedRecords))return value;
            const documents=await getDocuments();
            exec.signal?.throwIfAborted();
            const tables=hasSourceTable?resolveDelimitedDatasetReferences(value,documents):value;
            const source=hasWordGrid?resolveWordDocumentGrids(tables,documents):tables;
            return {...source,sharedDatasets:source.sharedDatasets.map(dataset=>{
                if(!citedRecords(dataset))return dataset;
                const matching=documents.filter(document=>dataset.note.includes(document.name));
                if(!matching.length||workbenchDocumentCitationIssue(dataset.note,matching))return dataset;
                const timeFields=Array.isArray(dataset.fields)?dataset.fields.filter(field=>typeof field?.key==='string'&&
                    (/^(?:asOf|date|sourceDate|资料时点|时点|日期|来源日期)$/iu.test(field.key)||
                     /^\p{L}[\p{L}\p{N}_-]*$/u.test(field.key)&&/^(?:资料时点|资料日期|来源时点|原文日期|日期)$/u.test(field.label))) : [];
                const records=dataset.records.map(row=>{
                    if(!row||typeof row!=='object'||Array.isArray(row))return row;
                    const missing=timeFields.filter(field=>!Object.hasOwn(row,field.key));
                    return missing.length?{...row,...Object.fromEntries(missing.map(field=>[field.key,null]))}:row;
                });
                return {...dataset,records,...(dataset.asOf===undefined?{asOf:'附件原文，记录时点以各条出处为准'}:{})};
            })};
        };
        const sourceCaptureWarnings = new Set();
        const observedSources=originalHumanRequest&&args?.dataMode!=='simulated'&&!documentExclusive?captureWorkbenchObservedSources({
            session:exec.agent.session,messageId:originalHumanRequest.messageId,schemas:ctx.tools.schemas?.(exec.agent)??[],
            onRejected:reason=>sourceCaptureWarnings.add(reason)
        }):undefined;
        if (args.panels?.some(panel => panel?.sourceView !== undefined)) {
            args = {...args, panels:args.panels.map((panel, index) => {
                if (panel?.sourceView === undefined) return panel;
                const {sourceView, ...rest} = panel;
                const scope = '/panels/' + index + '/sourceView';
                if (!originalRequest || documentExclusive || args.dataMode === 'simulated' || sharedPlans.has(exec.agent?.session?.id))
                    throw Error(scope + ' 仅用于当前私有研究请求的结构化来源，可独立提交图表或明细。');
                const conflict = ['content','artifact','view','publicData','profile','requests','library'].find(key => Object.hasOwn(rest,key));
                if (conflict) throw Error(scope + ' 使用 sourceView 时请删除同一面板的 ' + conflict + ' 字段，沿用本轮实际来源编号。');
                if (!['chart','table','market'].includes(rest.type) || rest.type === 'chart' && !sourceView?.chart_spec)
                    throw Error(scope + ' 图表需使用 type=chart 和 chart_spec，完整明细使用 type=table。');
                const sourcePolicy = workbenchSourcePolicy(originalRequest, rest);
                try {
                    return {...rest, type:sourceView?.chart_spec?'chart':'table', artifact:compileObservedSourceView(rest.title, sourceView,
                        workbenchObservedSourcesForPolicy(observedSources,sourcePolicy),{originalRequest,panelRequest:rest.prompt})};
                } catch (error) {
                    throw Error(scope + error.message + '。沿用同一份来源和其他面板，只修正这个字段。');
                }
            })};
        }
        if (documentExclusive && Array.isArray(args.panels)) {
            // Existing document content is deliverable after checking against
            // the same retained original evidence used by document workers.
            args = {...args, panels: args.panels.map(panel => {
                if (!panel || typeof panel !== 'object') return panel;
                const {publicData, profile, requests, intervalMinutes, library, ...pending} = panel;
                return pending;
            })};
        }
        const verifyDocumentPanels=async input=>{
            const prepared=documentPaths && input.panels.filter(panel=>panel.artifact);
            const issues = new Map();
            if(!prepared?.length)return issues;
            const documents=await getDocuments();
            exec.signal?.throwIfAborted();
            for(const panel of prepared){
                if(['financial-widget','calendar-tool'].includes(panel.type)){
                    if(documentExclusive)throw Error('文档专属看板不能混入无关外部行情或日历数据。');
                    continue;
                }
                const encoded=JSON.stringify(panel.artifact);
                if(panel.artifact.type==='markdown'&&/^(?:待填(?:写)?|待生成|占位|待补充)[。\s]*$/u.test(panel.artifact.content??'')){
                    issues.set(panel,'文档组件尚无正文，请使用已读取的原文完成此卡。');
                    continue;
                }
                // An original link may be displayed without fetching it. A new
                // external source cannot become document evidence via a label.
                const urlIssue = documentExclusive && workbenchDocumentSourceUrlIssue(encoded, documents);
                if (urlIssue) { issues.set(panel, urlIssue); continue; }
                const output=acceptArtifactOutput(encoded);
                if (!output) { issues.set(panel, '文档组件内容无法呈现，请保留原文和出处。'); continue; }
                const dataset=panel.type==='view'&&panel.artifact.dataset;
                const table=rows=>JSON.stringify({version:1,type:'table',title:panel.title,columns:dataset.fields.map(field=>field.label),rows:rows.map(record=>dataset.fields.map(field=>record[field.key])),note:dataset.note});
                const records=dataset?table(dataset.records.filter(record=>matchesDatasetViewScope(record,panel.artifact.view.where))):output;
                const issue=workbenchDocumentCitationIssue(output,documents,{required:documentExclusive})||documentUncertaintyIssue(output,documents)||(dataset&&delimitedTableIntegrityIssue(table(dataset.records),documents))||documentTableEntityCoverageIssue(records,documents,panel.prompt)||delimitedTableIntegrityIssue(records,documents,panel.prompt);
                if(issue)issues.set(panel, issue);
            }
            return issues;
        };
        args = preserveWorkbenchRefreshPreference(args, canvasHumanRequest(exec.agent?.session)?.text);
        if (args?.requestId === undefined) {
            const messageId = canvasHumanRequest(exec.agent?.session)?.messageId;
            if (messageId) args = { ...args, requestId: `auto-${createHash('sha256').update(messageId).digest('hex')}` };
        }
        const capture = sharedPlans.get(exec.agent?.session?.id);
        if (capture) {
            exec.signal?.throwIfAborted();
            return resolveSourceTables(args).then(async resolved=>{
                const plan = validateWorkbench(resolved);
                if (plan.panels.some(p => p.publicData)) throw Error('共享画板暂不支持内置免费源直通刷新，请使用普通面板取数流程。');
                if (plan.dataMode === 'simulated') throw Error('共享画板的模拟数据快路径尚未启用，请使用现有面板生成流程。');
                const issues = await verifyDocumentPanels(plan);
                if (issues.size) throw Error(issues.values().next().value);
                return capture(plan);
            });
        }
        const run = async () => {
            const fundCount = !originalImageMessageId && fundComparisonCount(originalRequest);
            const validationOptions = {recoverPreparedArtifacts:Boolean(documentPaths || observedSources?.length)};
            const parentSessionId = exec.agent?.session?.id;
            if (!str(parentSessionId, 256) || !ctx.agents.get(parentSessionId))
                throw Error('研究会话不可用');
            exec.signal?.throwIfAborted();
            await assertPrivateResearchSession(parentSessionId);
            const sources=await resolveSourceTables(args);
            const resolved=await resolveWorkbenchPrototypeTables(sources,ctx,exec,originalRequest);
            const {input:submitted,scopeDeficits:submittedDeficits} = validateWorkbenchDelivery(resolved, validationOptions);
            let input = submitted;
            let scopeDeficits = submittedDeficits;
            let preparedWordEvidence;
            const old = plans.find(p => p.parentSessionId === parentSessionId && p.requestId === submitted.requestId);
            let recoveredDraftHash = old?.recoveredDraftHash;
            if (old?.scopeDeficits) scopeDeficits = old.scopeDeficits;
            if (recoveredDraftHash) {
                if (recoveredDraftHash !== workbenchDraftHash(submitted)) throw Error('该 requestId 已用于另一份规划，新需求请使用新的标识。');
                input = old.input;
            } else if (!old) {
                assertWorkbenchViewSources(input);
                if(documentExclusive&&input.panels.some(panel=>['mind-map','markdown'].includes(panel.artifact?.type))){
                    const documents=preparedWordEvidence=await getDocuments();
                    const normalized=input.panels.map(panel=>completeWordReadingPanel(panel,documents,originalRequest));
                    const panels=completeWordOrganizationPanels(normalized,documents,originalRequest);
                    if(panels.some((panel,i)=>panel!==input.panels[i])){
                        recoveredDraftHash=workbenchDraftHash(submitted);
                        input={...input,panels};
                        scopeDeficits=workbenchScopeDeficits({...input,documentEvidence:documents});
                    }
                }
                const issues = await verifyDocumentPanels(input);
                if (issues.size) {
                    if (!documentExclusive) throw Error(issues.values().next().value);
                    recoveredDraftHash = workbenchDraftHash(submitted);
                    input = recoverPreparedPanels(input, issues);
                    scopeDeficits = workbenchScopeDeficits(input);
                }
                if (originalRequest && input.dataMode !== 'simulated') {
                    const releaseIssues = new Map();
                    for (const panel of input.panels) {
                        if (!panel.artifact) continue;
                        const issue = preparedReleaseCohortIssue({originalRequest, panelRequest:panel.title+'\n'+panel.prompt,
                            artifact:panel.artifact, observedSources, verifyOfficialCohort:true});
                        if (issue) releaseIssues.set(panel, issue);
                    }
                    if (releaseIssues.size) {
                        recoveredDraftHash = workbenchDraftHash(submitted);
                        input = recoverPreparedPanels(input, releaseIssues, {addGuidance:true});
                        scopeDeficits = workbenchScopeDeficits(input);
                    }
                }
                if (input.dataMode === 'simulated' && input.generationMode !== 'deferred' && input.panels.some(panel=>!panel.artifact)) {
                    ({input,scopeDeficits} = prepareLegacySimulation(input,typeof runtime.startBatch === 'function'));
                }
                for(const panel of input.panels.filter(panel=>panel.artifact?.type==='html')){
                    try { runtime.prepareArtifact?.(panel.artifact); }
                    catch(error){
                        throw Error(`面板「${panel.title}」未通过交互校验。请修正该卡并保留其余面板。${error.message}`+
                            (/表单/u.test(panel.title+'\n'+panel.prompt)?'常规字段、校验和本地登记使用原生 form，不依赖 localStorage。':''));
                    }
                }
            }
            const fundReader = fundCount && !args.preset && args.dataMode !== 'simulated' && input.panels.some(panel=>!panel.artifact&&!panel.publicData) && !input.sharedDatasets && !observedSources?.length && fundComparisonReader(ctx, exec.agent);
            // Resolve before queuing so ambiguous human restrictions remain explicit.
            const contexts = new Map(originalRequest ? input.panels.filter(p => !p.publicData).map(panel => {
                const authored=args.panels?.find(value=>value?.title?.trim()===panel.title);
                const publicSourceRequests=authored?workbenchQuoteSourceRequests(authored):undefined;
                const sourcePolicy=input.dataMode !== 'simulated' ? workbenchSourcePolicy(originalRequest, panel, {publicSourceRequests}) : {pluginRequired:false,pluginProhibited:false,preferenceRequest:panel.prompt};
                const sharedObservedRecords=workbenchObservedSourcesForPolicy(observedSources,sourcePolicy);
                return [JSON.stringify([panel.title,panel.type,panel.prompt]), {...(originalImageMessageId ? {sourceMessageId:originalImageMessageId} : {}),sourcePolicy,sourceRequirement:panel.prompt,...(sharedObservedRecords?{sharedObservedRecords}:{}),...(usesHumanSourceScope({originalRequest,dataMode:input.dataMode}) ? {explicitScope:workbenchExplicitScope(originalRequest,panel)} : {}),workbenchRequest:{originalRequest:input.originalRequest,dataMode:input.dataMode ?? 'source'}}];
            }) : []);
            let sharedEvidence;
            const panelContext = panel => ({...(input.sharedDatasets?{sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:panel.prompt},sourceRequirement:panel.prompt,sharedDatasets:input.sharedDatasets}:{}),...contexts.get(JSON.stringify([panel.title,panel.type,panel.prompt])), ...(sharedEvidence ? {sharedEvidence} : {})});
            const preparedPanel=panel=>{const hostContext=panelContext(panel);return {canvasNodeId:panel.nodeId,prompt:workbenchPanelPrompt(input,panel,comparisonReferenceTime),preparedRequirement:panel.prompt,artifact:panel.artifact,
                view:panel.view,documentEvidence:panel.artifact.type==='mind-map'?preparedWordEvidence:undefined,
                ...(hostContext.workbenchRequest?{hostContext}:{}),...(scopeDeficits.some(item=>item.panel===panel.title)?{scopeDeficits:scopeDeficits.filter(item=>item.panel===panel.title)}:{})};};
            const preparedReceipt=(panel,receipt)=>{panel.taskId=receipt.taskId;panel.prepared=true;Object.assign(panel,partialDelivery(receipt));delete panel.error;};
            const direct = input.panels.filter(p => p.publicData);
            const usesPublicSource=direct.length||args.panels?.some(p=>p?.publicData||p?.profile!==undefined||p?.requests!==undefined);
            if (usesPublicSource && (!ctx.tools.schemas?.(exec.agent)?.some(t => t.name === 'public_data_query') ||
                workbenchOfflineRequest(canvasHumanRequest(exec.agent?.session)?.text)))
                throw Error('当前任务未授权内置免费来源取数；请使用已有资料或正常面板流程。');
            if (direct.length && typeof runtime.startPublicDataBatch !== 'function') throw Error('免费源组件直通服务不可用。');
            if (input.generationMode === 'deferred' && input.panels.some(p=>!p.artifact) && typeof runtime.startBatch !== 'function') throw Error('延后模拟面板生成服务不可用。');
            const startDeferred = async plan => {
                const pending = plan.panels.filter(p => !p.taskId);
                try {
                    const prepared=pending.filter(p=>p.artifact),generated=pending.filter(p=>!p.artifact);
                    if(prepared.length){
                        const receipts=await runtime.startPreparedBatch({parentSessionId,panels:prepared.map(preparedPanel)});
                        prepared.forEach((p,i)=>preparedReceipt(p,receipts[i]));
                    }
                    if(generated.length){
                        const receipts = await runtime.startBatch({ parentSessionId, panels: generated.map(p => ({ canvasNodeId: p.nodeId, kind: 'container', prompt: workbenchPanelPrompt(plan, p,comparisonReferenceTime) })) }, {panels:generated.map(panelContext)});
                        generated.forEach((p, i) => { p.taskId = receipts[i].taskId; delete p.error; });
                    }
                } catch (error) {
                    for (const p of pending) if(!p.taskId)p.error = '面板任务未能启动，请重试。';
                    plan.ready = true; await persist(); throw error;
                }
            };
            if (old) {
                if (!recoveredDraftHash) {
                    const previous = validateWorkbenchDelivery(old.input ?? old, validationOptions).input;
                    const withoutScope = ({ originalRequest, ...plan }) => plan;
                    if (JSON.stringify(withoutScope(previous)) !== JSON.stringify(withoutScope(input)) ||
                        previous.originalRequest && input.originalRequest && previous.originalRequest !== input.originalRequest)
                        throw Error('该 requestId 已用于另一份规划，新需求请使用新的标识。');
                }
                if (old.ready && old.panels.some(p=>!p.taskId) && (recoveredDraftHash||old.generationMode==='deferred'||old.panels.every(p=>p.artifact))) { await startDeferred(old); await persist(); }
                return { ...refreshReceipt(), planId: old.id, tabs: old.tabs?.map(t=>t.name)??[], panels: old.panels.map(p => p.title), templateIds: templateIds(old.panels), status: old.ready ? incompleteWorkbench(old) ? 'incomplete' : (old.sharedComparisonPrepared || preparedWorkbench(old)) && old.panels.every(p=>p.taskId&&!p.error) ? 'prepared' : 'accepted' : 'preparing', ...workbenchReceiptDetail(old) };
            }
            const id = randomUUID();
            const plan = { ...input, input:recoveredDraftHash?input:submitted, id, parentSessionId, createdAt: Date.now(), ready: false,...(scopeDeficits.length?{scopeDeficits}:{}),...(recoveredDraftHash ? {recoveredDraftHash} : {}),...(sourceCaptureWarnings.size ? {sourceCaptureWarning:[...sourceCaptureWarnings].join('\n')} : {}),
                panels: bindWorkbenchLibraryLinks(layoutWorkbench(input.panels,undefined,input.tabs).map((p, i) => ({ ...p, nodeId: `${id}-${i}` })),input.links) };
            if (plans.length >= 200)
                plans = plans.filter(p => !p.applied || p.createdAt > Date.now() - 30 * 86400000);
            if (plans.length >= 1000)
                throw Error('工作台记录过多，暂时无法创建新的工作台。');
            plans.push(plan);
            // Save identities before starting children. A partial failure remains visible and retryable.
            try {
                await persist();
            }
            catch (error) {
                plans = plans.filter(p => p.id !== id);
                throw error;
            }
            // Let the canvas mount the exact validated plan before any panel
            // preparation starts. The bounded fallback also supports headless
            // sessions without an open renderer.
            await waitForCanvas(id);
            if (fundReader) {
                try {
                    const data=await acquireFundComparison({count:fundCount,query:(request,signal)=>fundReader(request,exec,signal),signal:exec.signal});
                    exec.signal?.throwIfAborted();
                    // Acquisition optimizations supply facts, never replace the user's
                    // plan or dictate the number and shape of the final components.
                    const evidence = fundComparisonArtifacts(data)[0];
                    sharedEvidence = JSON.stringify(evidence);
                    for (const panel of plan.panels) {
                        const artifact = prepareFundComparisonOverview(panel,data,evidence);
                        if (artifact) panel.artifact = artifact;
                    }
                } catch (error) {
                    if (exec.signal?.aborted) {
                        for (const panel of plan.panels) panel.error = '面板生成已取消，尚未启动。';
                        plan.ready = true;
                        mountedPlans.delete(id);
                        await persist();
                        exec.signal.throwIfAborted();
                    }
                    plan.acquisitionWarning=error instanceof Error?error.message:'共同取数未完成，转入各组件继续获取。';
                }
            }
            if (input.generationMode === 'deferred') {
                if (exec.signal?.aborted) {
                    for (const panel of plan.panels) panel.error = '面板生成已取消，尚未启动。';
                    plan.ready = true; await persist(); exec.signal.throwIfAborted();
                }
                await startDeferred(plan);
            } else if (input.dataMode === 'simulated') {
                await startDeferred(plan);
            } else {
                const prepared = plan.panels.filter(p => p.artifact);
                const pending = plan.panels.filter(p => !p.artifact && !p.publicData);
                const direct = plan.panels.filter(p => p.publicData);
                try {
                    if (direct.length) {
                        const receipts = await runtime.startPublicDataBatch({ parentSessionId, panels: direct.map(p => ({ canvasNodeId: p.nodeId, title: p.title, type: p.type, prompt: workbenchPanelPrompt(input, p,comparisonReferenceTime), publicDataPrompt: p.prompt, publicData: p.publicData })) });
                        direct.forEach((p, i) => { p.taskId = receipts[i].taskId; });
                    }
                    if (prepared.length) {
                        const receipts = await runtime.startPreparedBatch({parentSessionId, panels:prepared.map(preparedPanel)});
                        prepared.forEach((p,i) => preparedReceipt(p,receipts[i]));
                    }
                    if (pending.length && typeof runtime.startBatch === 'function') {
                        const receipts = await runtime.startBatch({parentSessionId, panels:pending.map(p => ({canvasNodeId:p.nodeId,kind:'container',prompt:workbenchPanelPrompt(input,p,comparisonReferenceTime)}))}, {panels:pending.map(panelContext)});
                        pending.forEach((p,i) => {p.taskId=receipts[i].taskId;});
                    } else for (const p of pending) {
                        try { p.taskId=(await runtime.start({parentSessionId,canvasNodeId:p.nodeId,kind:'container',prompt:workbenchPanelPrompt(input,p,comparisonReferenceTime)}, panelContext(p))).taskId; } catch { p.error='面板任务未能启动，请重试。'; }
                    }
                } catch(error) {
                    for(const p of plan.panels) if(!p.taskId)p.error='面板任务未能启动，请重试。';
                }
            }
            plan.ready = true;
            mountedPlans.delete(id);
            await persist();
            return { ...refreshReceipt(), planId: id, tabs: plan.tabs?.map(t=>t.name)??[], panels: plan.panels.map(p => p.title), templateIds: templateIds(plan.panels), status: incompleteWorkbench(plan)?'incomplete':(plan.sharedComparisonPrepared||preparedWorkbench(input)) && plan.panels.every(p=>p.taskId&&!p.error) ? 'prepared' : 'accepted', ...workbenchReceiptDetail(plan) };
        };
        const pending = chain.then(run);
        chain = pending.catch(() => { });
        return pending;
    };
    const disposeSourceTool = ctx.tools.register(defineTool({
        name: OBSERVED_SOURCES_TOOL,
        description: '列出当前研究工作台请求已经取得的完整结构化来源和字段，用于 sourceView。只读，不发起查询。',
        parameters: {},
        output: { schema: {type:'object',additionalProperties:true}, render: (_args, value) => [{type:'text',text:JSON.stringify(value)}] },
        isConcurrencySafe: () => true,
        execute(_args, exec) {
            const human = workbenchCreationRequest(exec.agent?.session);
            if (!human) return {sources:[]};
            return {sources:listWorkbenchObservedSources(exec.agent.session,human.messageId,ctx.tools.schemas?.(exec.agent)??[])};
        }
    }));
    const disposeTool = ctx.tools.register(defineTool({
        name: 'research_workbench_create',
        timeoutMs: 115000,
        description: '按用户需求在研究画布新增工作台。先明确对象、范围、页签与操作，再组织内容；每个panel提供title、prompt和建议type。类型只指导布局，可按真实内容调整；复杂交互可用html。已取得的完整内容放content直接呈现，宿主编译图表或完整可读表格，无需再起逐卡子任务；复杂自定义交互可用artifact。只有未取得的内容才由子任务获取或解析，原资料、日期及来源须完整保留。真实内容不得用模拟补齐，演示仅在用户允许时用dataMode:simulated。共同数据可用sharedDatasets，同一请求重试沿用requestId。原生行情、自选、资讯等可用library（见参数）；联动用links，主题分页用tabs。新增不会替换已有组件，修改先inspect再apply。返回accepted表示已启动，不代表完成；prepared表示内容已准备好。不要公开接口目录、来源选择原则或宣称未确认的自动刷新。',

        parameters: {
            requestId: { type: 'string', description: '可选。本轮需求的稳定标识，重试保持一致；省略时宿主根据当前用户消息生成，重复调用不会重复建卡。' },
            title: { type: 'string', required: true, description: '工作台标题。必须同时提供panels完整清单；不能仅提交title。使用preset时panels填空数组。' },
            dataMode: { type: 'string', enum: ['simulated', 'source'], description: '真实来源使用source（也可省略）；用户允许演示数据且个人看板时使用simulated。实时预设cn-hot-etf-live不可使用simulated。' },
            generationMode: { type: 'string', enum: ['parallel','deferred'], description: '用户允许模拟时，多卡同一对象优先sharedDatasets+type:view直接准备；模板能力之外且未提供完整数据才用deferred：首轮只提交面板规划和sharedContext，受理后由受限子卡生成完整记录；普通延后卡不混用artifact/preset，已解析的view直接准备。parallel保留旧本地固定样例行为。真实来源省略。' },
            sharedContext: { type: 'string', description: '仅deferred或完整sharedDatasets。最多3000字符，跨卡共用的事实、总额及紧凑分配、日期、容量、单位和口径；不填逐行明细或完整图表序列。原始用户需求由宿主自动保留，用户明确约束优先。' },
            preset: { type: 'string', enum: [...LIVE_WORKBENCH_PRESETS, ...SIMULATED_WORKBENCH_PRESETS], description: 'cn-hot-etf-live为国内代表性基金ETF真实行情8卡，dataMode:source、panels:[]，无需先query或抄写数据，由宿主取数并自动刷新。其余为模拟预设，须dataMode:simulated。预设不能混用自定义面板。' },
            links:{type:'array',description:'组件节点联动。panels零基序号；自选→行情/新闻/公告，行情→新闻/公告，每目标至多一个来源。',items:{type:'object',additionalProperties:false,properties:{sourcePanel:{type:'integer',required:true},targetPanel:{type:'integer',required:true}}}},
            tabs: {type:'array',description:'原生看板页签。要求分页面/按页签切换时必填；每卡恰好归属一页，不在 prompt 中假装有页签。',items:{type:'object',additionalProperties:false,properties:{name:{type:'string',required:true},panelIndexes:{type:'array',required:true,description:'本页 panels 的零起始下标，如 [0,1,2]。',items:{type:'integer'}}}}},
            panels: { type: 'array', required: true, description: '必填。自定义工作台提交1–30个含title/prompt/type的完整面板，size可省略由宿主按内容排版；已取得内容直接提交content，已有规范组件可提交artifact；完整共同记录用sharedDatasets+view。仅内置preset使用空数组[]。', items: { type: 'object', additionalProperties: false, properties: {
                        title: { type: 'string', description: '卡片标题；已有 content.title 或 artifact.title 时可复用，其他面板必填。' }, prompt: { type: 'string', required: true, description: '描述本面板的问题、范围、日期、单位、来源和用户所需操作。已取得且授权共享的工具结果由宿主提供受限本地快照，子任务可用 workbench_source_read 复用；无需在每卡重复抄录。' },
                        note: {type:'string',description:'可选，2000 字以内的规划补充说明。经核对的成品附注写入 content.note 或受支持的 artifact.note。'},
                        type: { type: 'string', enum: types, required: true, description: 'view必须同时提供完整sharedDatasets与每卡view，不能作为deferred占位。table仅支持平面行、排序和搜索，不能逐条展开详情。时序记录可用timeline/calendar等合适模板；明确需要可展开表格或独特业务交互时用html；模拟场景保留deferred与sharedContext，由受限子卡离线生成自包含HTML；真实记录保持原数据性质和来源约束，不改称模拟。散点图用 market 且 prompt 声明 variant: scatter；普通柱状图用 chart 并声明 chart.bar；指标卡 metrics 只显示数值，不会渲染散点或柱状图。' }, size: { type: 'string', enum: ['small', 'medium', 'large', 'wide'], description: '可省略，由宿主按内容选择尺寸。通用组件初始规格：small 320×220、medium 656×220、large 656×456；金融 market 组件由宿主以 Figma 源节点为基线按内容密度确定几何，此字段只作画布预设。按内容密度选规格，内容放不下则拆分组件或提供完整阅读入口。字体不缩小。' },
                        layout: {type:'string',enum:['standard','wide'],description:'可选的语义阅读布局；排程、宽对照、图表与独立详情并排时用wide跨整行，其余standard。不要所有面板选同一宽度；手动尺寸优先。'},
                        view: {...DATASET_VIEW_SCHEMA,description:'共同记录引用。交互列表/排程用 type:view；共享汇总图用 type:chart，view.sections 提供一个 records 区，label 为分类键，fields 按先绘制、后明细顺序列数值键。不同单位分别绘图或在明细保留。整体指标用 type:kpi、groupBy:[] 的汇总集和一个 records 区。原生事件用 type:timeline 和一个 schedule 区，单点事件 end 同 start。无需 artifact 或生成代码。'},
                        hierarchy: DATASET_HIERARCHY_SCHEMA,
                        samplesFromPanel: { type: 'string', description: '仅直方图：引用本工作台一个箱线图面板的完整标题，其artifact.groups必须含原始samples。直方图artifact省略samples/bins，unit与来源一致；宿主自动合并并保留重复观测。' },
                        intervalMinutes: { type: 'number', description: '仅publicData面板的可选兼容写法；规范写在publicData.intervalMinutes。两处同时提供须一致，否则拒绝。' },
                        profile: { type: 'string', enum: Object.keys(PUBLIC_DATA_PROFILES), description: '兼容平铺写法，必须同时提供requests；优先写入publicData.profile，不与嵌套配置冲突。' },
                        requests: { ...publicDataRequestsSchema, description: '兼容平铺写法，必须同时提供profile；优先写入publicData.requests。' },
                        library:{type:'object',additionalProperties:false,description:'实时行情、K线和可搜索实时新闻优先直接挂载组件库，省略artifact和publicData。options只填配置，不填数据。',properties:{id:{type:'string',enum:WORKBENCH_LIBRARY_IDS,required:true},options:{type:'object',additionalProperties:true,description:'symbols:[{code,market,name}], query, period, adjustment, indicators, dataSource, refreshMinutes, refreshEnabled。加密现货用 market:CRYPTO 与 BTC/USD、ETH/USD 或 SOL/USD；专题实时新闻用 query，按需要设置 dataSource:doubao；日历无需options。'}}},
                        content: {type:'object',additionalProperties:true,description:COMPONENT_CONTENT_GUIDANCE},
                        sourceView: {...OBSERVED_SOURCE_VIEW_SCHEMA,description:OBSERVED_SOURCE_GUIDANCE},
                        artifact: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }], description: '可选。已取得的真实数据或明确模拟数据，按 template 数据契约填写 version:1、type、title 及数据字段；无需 HTML。deferred模式优先省略，null仅在该模式表示尚未提供数据；其他模式不接受null。真实来源/时点就近标注。' },
                        publicData: { type: 'object', additionalProperties: false, description: '嵌套于panel的已适配来源配置；必须显式填写publicData.profile，只在prompt写profile无效。例如 {"profile":"quotes-table","requests":[{"source":"tencent-quotes","parameters_json":"{\\"symbols\\":[\\"sh510300\\"]}"}],"intervalMinutes":1}。宿主并行取数、渲染模板并保存自动刷新；无需先query、抄写数据或逐卡模型。与artifact/模拟模式互斥。', properties: {
                            profile: { type: 'string', enum: Object.keys(PUBLIC_DATA_PROFILES), description: 'quotes-table/quotes-metrics用tencent-quotes；crypto-metrics用kraken-ticker（1–8个pair，每请求一个pair，3–8个自动合成表格，宜layout:wide）；price-volume用kraken-candles或tencent-history；candlestick仅tencent-history日线；news用sina-news且panel.type=news，其余panel.type=market。应显式提供；仅单个腾讯报价请求且明确声明table类型、market.table或key/label列结构时，缺键可由宿主推导quotes-table。模糊或冲突的显示意图仍报错，显式配置不被覆盖。' },
                            intervalMinutes: { type: 'number', description: '默认1分钟；0仅手动；遵从用户指定的频率。' },
                            layoutProfile: { type: 'string', enum: ['openterminal'], description: '仅quotes-table、price-volume、news支持专用OpenTerminal布局；不改变原生金融组件或metrics布局。' },
                            requests: { ...publicDataRequestsSchema, required: true }
                        } }
                    } } },
            sharedDatasets: WORKBENCH_DATASETS_SCHEMA
        },
        output: { schema: { type: 'object', additionalProperties: false, properties: { tabs:{type:'array',items:{type:'string'}}, planId: { type: 'string', required: true }, panels: { type: 'array', items: { type: 'string' }, required: true }, templateIds: { type: 'array', items: { type: 'string' }, required: true }, status: { type: 'string', required: true }, detail: { type: 'string', description: '未完成原因；保留现有计划，不重新创建同一工作台。' }, refreshStatus: { type: 'string', enum: ['unverified'] }, refreshGuidance: { type: 'string' } } }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
        execute: async (args, exec) => {
            const authored = workbenchCreationRequest(exec.agent?.session);
            const receipt = await create(args, exec);
            // The durable plan is the parent turn's deliverable. Component
            // workers continue independently, including partial plans whose
            // canvas already provides a retry. Only a requested inline data
            // binding still needs a follow-up model step after creation.
            if (authored && workbenchCreationRequest(exec.agent?.session)?.messageId === authored.messageId &&
                !exec.signal?.aborted && receipt?.planId &&
                (receipt.status === 'incomplete' ||
                 ['prepared','accepted'].includes(receipt.status) && !workbenchNeedsInlineBinding(args, authored.text))) {
                exec.concludeTurn?.();
            }
            return receipt;
        }
    }));
    const disposeRoute = ctx.webServer.register({ kind: 'exact', path: WORKBENCH_PATH, handler: async (req, res) => {
            const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
            if (req.method !== 'POST')
                return send(405, { error: 'Method not allowed' });
            if (!isTrustedRequest(req, true))
                return send(403, { error: 'Request rejected' });
            try {
                const { parentSessionId, acknowledged = [], mounted = [] } = await readJsonBody(req);
                await assertPrivateResearchSession(parentSessionId);
                if (!str(parentSessionId, 256))
                    return send(400, { error: '会话无效' });
                if (!Array.isArray(acknowledged) || acknowledged.length > 100 || !Array.isArray(mounted) || mounted.length > 100)
                    return send(400, { error: '请求无效' });
                for (const p of plans) if (p.parentSessionId === parentSessionId && !p.ready && mounted.includes(p.id)) {
                    mountedPlans.add(p.id);
                    mountWaiters.get(p.id)?.();
                }
                if (acknowledged.length) {
                    const pending = chain.then(async () => { for (const p of plans)
                        if (p.parentSessionId === parentSessionId && p.ready && acknowledged.includes(p.id))
                            p.applied = true; await persist(); });
                    chain = pending.catch(() => { });
                    await pending;
                }
                send(200, { plans: plans.filter(p => p.parentSessionId === parentSessionId && !p.applied).map(p => ({ id: p.id, title: p.title, createdAt: p.createdAt, ready: p.ready, ...(workbenchRequestedStyle(p.originalRequest)?{requestedStyle:workbenchRequestedStyle(p.originalRequest)}:{}), ...(p.tabs?{tabs:p.tabs}:{}), panels: p.panels.map(({ artifact, ...panel }) => ({
                    ...panel,
                    ...(!p.ready && !panel.taskId && !panel.error ? { pending: true } : {}),
                    // A completed prepared plan can also be mounted after the
                    // preparation finishes, such as when the renderer reloads.
                    ...((p.dataMode === 'simulated' || panel.prepared) && panel.taskId ? (()=>{const task=runtime.inspect({parentSessionId,taskId:panel.taskId,afterSeq:0}),delivery=partialDelivery(task);return {preparedOutput:task.finalOutput,...(delivery?{preparedDelivery:delivery}:{})};})() : {})
                })) })) });
            }
            catch {
                send(400, { error: '工作台读取失败' });
            }
        } });
    return async () => { disposeSourceTool(); disposeTool(); disposeRoute(); if (runtime.inspectPendingGeneration === inspectPendingGeneration) delete runtime.inspectPendingGeneration; await chain; };
}
