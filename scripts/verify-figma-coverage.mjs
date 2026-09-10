#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const STATUSES = new Set(['indexed', 'measured', 'implemented', 'visual-pass', 'interaction-pass', 'accepted', 'superseded']);
const REAL_KINDS = ['electron-screenshot', 'electron-interaction', 'electron-font-audit', 'electron-visual-comparison'];
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Validate provenance and coverage only; this never launches or controls an application. */
export function verifyFigmaCoverage(manifest, index, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const mode = options.mode || 'coverage';
  const errors = [], warnings = [];
  const fail = (id, reason) => errors.push({ caseId: id, reason });
  if (!['coverage', 'design', 'acceptance'].includes(mode)) fail('manifest', 'Unknown verification mode');
  if (manifest.sourceIndex && manifest.sourceIndexSha256) {
    try { if (sha256(fs.readFileSync(path.resolve(root, manifest.sourceIndex))) !== manifest.sourceIndexSha256) fail('manifest', 'Source index checksum mismatch'); }
    catch { fail('manifest', 'Missing immutable source index'); }
  } else fail('manifest', 'Missing source index provenance');
  if (!Array.isArray(manifest.designAssets) || !manifest.designAssets.length) fail('manifest', 'Missing design asset registry');
  else {
    const entries = manifest.designAssets.map(a => [a.file, a.sha256]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    if (sha256(Buffer.from(JSON.stringify(entries))) !== manifest.designFingerprint) fail('manifest', 'Design fingerprint is not derived from the current asset registry');
    for (const [file, digest] of entries) {
      try { if (sha256(fs.readFileSync(path.resolve(root, file))) !== digest) fail('manifest', `Design baseline asset changed: ${file}`); }
      catch { fail('manifest', `Missing design baseline asset: ${file}`); }
    }
  }
  if (manifest.fileKey !== index.fileKey) fail('manifest', 'Figma file does not match the source index');
  if (!Array.isArray(manifest.cases)) return { ok: false, mode, errors: [{ caseId: 'manifest', reason: 'cases must be an array' }], warnings };
  if (index.frames.length !== index.screenFrameCount || index.variants.length !== index.variantCount) fail('index', 'Source index count is inconsistent');
  const requiredFrames = new Set(index.frames.map(x => x.nodeId));
  const requiredVariants = new Set(index.variants.map(x => x.id));
  const knownNodes = new Set([...requiredFrames, ...requiredVariants]);
  const nodeOwners = new Map();
  const attributeFiles = new Set(manifest.cases.flatMap(c => (c.designEvidence || []).filter(e => e.captureKind === 'figma-node-attributes').map(e => e.file)));
  function collect(node, frameId) { if (!node || typeof node !== 'object') return; if (node.id) { knownNodes.add(node.id); nodeOwners.set(node.id, frameId); } for (const child of node.children || []) collect(child, frameId); }
  for (const file of attributeFiles) {
    try { const snapshot = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8')); collect(snapshot.tree, snapshot.frameId || snapshot.tree?.id); }
    catch { fail('manifest', `Invalid complete node snapshot: ${file}`); }
  }
  const requiredSubstates = new Map();
  try {
    const ref = manifest.substateIndex;
    if (!ref?.file || !ref.sha256 || !manifest.designAssets?.some(a => a.file === ref.file && a.sha256 === ref.sha256)) throw new Error('not fingerprinted');
    const bytes = fs.readFileSync(path.resolve(root, ref.file));
    if (sha256(bytes) !== ref.sha256) throw new Error('checksum mismatch');
    const reviewed = JSON.parse(bytes.toString());
    if (reviewed.fileKey !== manifest.fileKey || !Array.isArray(reviewed.frames)) throw new Error('wrong scope');
    for (const row of reviewed.frames) {
      if ((!requiredFrames.has(row.frameId) && !requiredVariants.has(row.frameId)) || requiredSubstates.has(row.frameId) || !Array.isArray(row.productStateIds) || !row.productStateIds.length) throw new Error('invalid frame inventory');
      requiredSubstates.set(row.frameId, new Set(row.productStateIds));
      for (const nodeId of row.productStateIds) if (nodeOwners.get(nodeId) !== row.frameId) fail(row.frameId + '--' + nodeId, 'Reviewed substate does not belong to its captured frame');
    }
    for (const nodeId of [...requiredFrames, ...requiredVariants]) if (!requiredSubstates.has(nodeId)) fail(nodeId, 'Missing reviewed substate inventory');
  } catch (error) { fail('manifest', 'Missing or invalid fingerprinted substate inventory: ' + error.message); }
  const seen = new Set(), coveredFrames = new Set(), coveredVariants = new Set();
  const packageCommit = options.packageCommit;
  if (mode === 'acceptance' && !/^[a-f\d]{40}$/i.test(packageCommit || '')) fail('manifest', 'Acceptance requires an explicit current --package-commit (40-character SHA)');
  const evidenceCache = new Map();
  function evidence(id, item, runtime) {
    if (!item || typeof item !== 'object') { fail(id, 'Evidence must be an object'); return null; }
    for (const key of ['packageCommit', 'appPath', 'captureKind', 'viewport', 'deviceScaleFactor', 'file', 'sha256']) if (!(key in item)) fail(id, `Evidence is missing ${key}`);
    if (!nonempty(item.file) || !nonempty(item.captureKind) || !/^[a-f\d]{64}$/i.test(item.sha256 || '')) { fail(id, 'Evidence file, kind or SHA-256 is invalid'); return null; }
    if (!(item.viewport?.width > 0 && item.viewport?.height > 0 && item.deviceScaleFactor > 0)) fail(id, 'Evidence viewport/deviceScaleFactor is invalid');
    const target = path.resolve(root, item.file);
    let bytes;
    try {
      bytes = evidenceCache.get(target);
      if (!bytes) { bytes = fs.readFileSync(target); evidenceCache.set(target, bytes); }
      if (sha256(bytes) !== item.sha256) fail(id, `Evidence checksum mismatch: ${item.file}`);
    } catch { fail(id, `Missing evidence file: ${item.file}`); return null; }
    if (!runtime && item.captureKind === 'figma-node-export' && item.file.endsWith('.png')) {
      if (bytes.length < 24 || bytes.subarray(1, 4).toString() !== 'PNG') fail(id, 'Figma PNG export has an invalid header');
      else if (bytes.readUInt32BE(16) !== Math.round(item.viewport.width * item.deviceScaleFactor) || bytes.readUInt32BE(20) !== Math.round(item.viewport.height * item.deviceScaleFactor)) fail(id, 'Figma PNG pixels do not match the recorded export boundary');
      if (item.exportBoundary === 'absolute-render-bounds') {
        const region = item.applicationRegion;
        if (!region || region.x < 0 || region.y < 0 || !(region.width > 0 && region.height > 0) || region.x + region.width > item.viewport.width || region.y + region.height > item.viewport.height) fail(id, 'Expanded export must identify its exact application region');
      }
    }
    if (runtime) {
      if (!REAL_KINDS.includes(item.captureKind)) fail(id, `Non-client evidence cannot establish acceptance: ${item.captureKind}`);
      if (item.packageCommit !== packageCommit) fail(id, 'Runtime evidence belongs to a different or unspecified package');
      if (!path.isAbsolute(item.appPath || '') || !item.appPath.endsWith('.app')) fail(id, 'Runtime evidence must identify the real application bundle');
      if (item.caseId !== id) fail(id, 'Runtime evidence must identify its exact case');
      if (item.designFingerprint !== manifest.designFingerprint) fail(id, 'Runtime evidence predates the current design baseline');
      if (item.captureKind === 'electron-screenshot') {
        if (bytes.length < 24 || bytes.subarray(1, 4).toString() !== 'PNG') fail(id, 'Client screenshot must be the original PNG');
        else if (bytes.readUInt32BE(16) !== Math.round(item.viewport.width * item.deviceScaleFactor) || bytes.readUInt32BE(20) !== Math.round(item.viewport.height * item.deviceScaleFactor)) fail(id, 'Screenshot pixels do not match viewport and deviceScaleFactor');
      } else {
        let record;
        try { record = JSON.parse(bytes.toString()); } catch { fail(id, `Invalid machine-readable runtime evidence: ${item.file}`); return null; }
        if (record.caseId !== id || record.packageCommit !== packageCommit || record.passed !== true || record.captureKind !== item.captureKind) fail(id, 'Runtime evidence result is missing, failed or attributed to another case/package');
        if (item.captureKind === 'electron-interaction' && (!Array.isArray(record.steps) || !record.steps.length || record.steps.some(s => s.passed !== true))) fail(id, 'Interaction evidence must include successful executed steps');
        if (item.captureKind === 'electron-font-audit' && (!Array.isArray(record.nodes) || !record.nodes.length || record.nodes.some(n => n.loaded !== true || !n.actualFonts?.length || !n.expectedFonts?.length || n.expectedFonts.some(f => !n.actualFonts.some(a => (typeof a === 'string' ? a : a.familyName) === f))))) fail(id, 'Font evidence must include loaded, actually rendered fonts matching expected families');
        if (item.captureKind === 'electron-visual-comparison' && (!record.referenceSha256 || !record.screenshotSha256 || !Number.isFinite(record.maxGeometryErrorCssPx) || record.maxGeometryErrorCssPx < 0 || record.maxGeometryErrorCssPx > 1 || record.materialsMatch !== true || record.textWrapMatch !== true || record.statesMatch !== true)) fail(id, 'Visual comparison lacks geometry, material, text or state verification');
      }
    }
    return item;
  }
  for (const c of manifest.cases) {
    const id = c.caseId || '(missing caseId)';
    if (!nonempty(c.caseId) || seen.has(id)) fail(id, 'Missing or duplicate caseId');
    seen.add(id);
    for (const key of ['frameId', 'subnodeId', 'role', 'theme', 'page', 'preconditions', 'steps', 'expected', 'implementationFiles', 'status', 'designEvidence', 'runtimeEvidence', 'differences']) if (!(key in c)) fail(id, `Missing required field: ${key}`);
    if (requiredFrames.has(c.frameId)) coveredFrames.add(c.frameId);
    else if (!requiredVariants.has(c.frameId) && c.role !== 'combination') fail(id, 'Case frame is outside the indexed Figma scope');
    if (c.role === 'variant' && requiredVariants.has(c.subnodeId)) coveredVariants.add(c.subnodeId);
    if (!STATUSES.has(c.status)) fail(id, 'Unsupported status');
    if (!nonempty(c.subnodeId) || !nonempty(c.role) || !nonempty(c.theme) || !nonempty(c.page)) fail(id, 'Node, role, theme and page must be explicit');
    if (!knownNodes.has(c.subnodeId)) fail(id, 'Substate node does not exist in the captured design');
    if (c.role !== 'combination' && nodeOwners.get(c.subnodeId) !== c.frameId) fail(id, 'Substate node belongs to a different captured frame');
    if (c.role !== 'combination' && !requiredSubstates.get(c.frameId)?.has(c.subnodeId)) fail(id, 'Substate is absent from the reviewed inventory');
    if (c.status === 'superseded') {
      if (!nonempty(c.replacesBy) && !nonempty(c.supersededByUserRequirement)) fail(id, 'Superseded case has no explicit replacement authority');
      if (nonempty(c.replacesBy) && !knownNodes.has(c.replacesBy)) fail(id, 'Replacement node does not exist in the captured design');
      if (!nonempty(c.supersededScope)) fail(id, 'Supersession must state its exact local scope');
      continue;
    }
    for (const key of ['preconditions', 'steps', 'expected', 'implementationFiles']) if (!Array.isArray(c[key]) || !c[key].length || c[key].some(x => !nonempty(x))) fail(id, `${key} requires explicit nonempty entries`);
    for (const file of c.implementationFiles || []) if (!fs.existsSync(path.resolve(root, file))) fail(id, `Implementation mapping does not exist: ${file}`);
    const design = (Array.isArray(c.designEvidence) ? c.designEvidence : []).map(e => evidence(id, e, false)).filter(Boolean);
    for (const item of design) if (!manifest.designAssets?.some(a => a.file === item.file && a.sha256 === item.sha256)) fail(id, 'Design evidence is outside the fingerprinted asset registry');
    if (!design.some(e => e.captureKind === 'figma-node-attributes')) fail(id, 'No complete node-attribute evidence');
    const hasReference = design.some(e => e.captureKind === 'figma-node-export');
    if (!hasReference) {
      if (mode === 'design' || mode === 'acceptance' || c.status !== 'indexed') fail(id, 'No original node reference export');
      else warnings.push({ caseId: id, reason: 'Indexed only: original reference export is still missing' });
    }
    if (mode === 'acceptance' || c.status === 'accepted') {
      if (c.status !== 'accepted') fail(id, `Unaccepted case: ${c.status}`);
      if (c.differences?.some(d => d.status !== 'resolved')) fail(id, 'Unresolved design or interaction differences');
      const runtime = (Array.isArray(c.runtimeEvidence) ? c.runtimeEvidence : []).map(e => evidence(id, e, true)).filter(Boolean);
      for (const kind of REAL_KINDS) if (!runtime.some(e => e.captureKind === kind)) fail(id, `Missing current-package ${kind}`);
      if (new Set(runtime.map(e => e.appPath)).size > 1) fail(id, 'Runtime evidence mixes different application bundles');
      const screenshot = runtime.find(e => e.captureKind === 'electron-screenshot');
      const comparison = runtime.find(e => e.captureKind === 'electron-visual-comparison');
      if (comparison && screenshot) {
        try {
          const result = JSON.parse(fs.readFileSync(path.resolve(root, comparison.file), 'utf8'));
          if (result.screenshotSha256 !== screenshot.sha256 || !design.some(e => e.captureKind === 'figma-node-export' && e.sha256 === result.referenceSha256)) fail(id, 'Comparison is not bound to this reference and screenshot');
        } catch { fail(id, 'Comparison evidence is unreadable'); }
      }
    }
  }
  for (const id of requiredFrames) if (!coveredFrames.has(id)) fail(id, 'Missing indexed screen frame');
  for (const id of requiredVariants) if (!coveredVariants.has(id)) fail(id, 'Missing indexed component variant');
  for (const [frameId, ids] of requiredSubstates) for (const nodeId of ids) if (!manifest.cases.some(c => c.frameId === frameId && c.subnodeId === nodeId && c.role !== 'combination')) fail(frameId + '--' + nodeId, 'Missing reviewed nested product state');
  for (const [i, requirement] of (manifest.additionalCombinationRequirements || []).entries()) {
    const linked = manifest.cases.filter(c => c.role === 'combination' && c.combinationRequirement === requirement);
    if (!linked.length) {
      const record = { caseId: `combination-${i + 1}`, reason: 'Additional cross-state combination has not yet been expanded into executable cases: ' + requirement };
      if (mode === 'acceptance') errors.push(record); else warnings.push(record);
    }
  }
  return { ok: errors.length === 0, mode, scope: { frames: coveredFrames.size, expectedFrames: requiredFrames.size, variants: coveredVariants.size, expectedVariants: requiredVariants.size, cases: manifest.cases.length, accepted: manifest.cases.filter(c => c.status === 'accepted').length, superseded: manifest.cases.filter(c => c.status === 'superseded').length }, errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const root = path.resolve(value('--root', process.cwd()));
  try {
    const index = JSON.parse(fs.readFileSync(path.resolve(root, value('--index', 'docs/superpowers/plans/2026-09-11-figma-full-client-fidelity.design-index.json')), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.resolve(root, value('--manifest', 'output/figma-full-acceptance/manifest.json')), 'utf8'));
    const result = verifyFigmaCoverage(manifest, index, { root, mode: value('--mode', 'coverage'), packageCommit: value('--package-commit', undefined) });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) { process.stderr.write(String(error) + '\n'); process.exitCode = 1; }
}
