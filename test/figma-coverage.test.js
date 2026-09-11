import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256, verifyFigmaCoverage } from '../scripts/verify-figma-coverage.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const PACKAGE = 'a'.repeat(40);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-coverage-')); roots.push(root);
  const index = { fileKey: 'test-file', screenFrameCount: 1, variantCount: 1, frames: [{ nodeId: '1:1' }], variants: [{ id: '2:1' }] };
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(root, 'implementation.js'), 'export {};');
  fs.writeFileSync(path.join(root, 'nodes.json'), JSON.stringify({ frameId: '1:1', tree: { id: '1:1', children: [{ id: '1:2' }] } }));
  fs.writeFileSync(path.join(root, 'variant.json'), JSON.stringify({ frameId: '2:1', tree: { id: '2:1' } }));
  fs.writeFileSync(path.join(root, 'substates.json'), JSON.stringify({ fileKey: 'test-file', frames: [{ frameId: '1:1', productStateIds: ['1:1'] }, { frameId: '2:1', productStateIds: ['2:1'] }] }));
  fs.writeFileSync(path.join(root, 'reference.png'), PNG);
  const designAssets = ['nodes.json', 'reference.png', 'substates.json', 'variant.json'].map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
  const manifest = { fileKey: 'test-file', sourceIndex: 'index.json', sourceIndexSha256: sha256(fs.readFileSync(path.join(root, 'index.json'))), substateIndex: designAssets.find(a => a.file === 'substates.json'), designAssets, designFingerprint: sha256(Buffer.from(JSON.stringify(designAssets.map(x => [x.file, x.sha256])))), cases: [] };
  for (const [node, role] of [['1:1', 'app-state'], ['2:1', 'variant']]) manifest.cases.push({
    caseId: node, frameId: node, subnodeId: node, role, theme: 'light', page: 'Test page', preconditions: ['Test data is ready'], steps: ['Open the real view'], expected: ['View matches'], implementationFiles: ['implementation.js'], status: 'measured', differences: [], runtimeEvidence: [],
    designEvidence: designAssets.filter(a => a.file === 'reference.png' || a.file === (node === '1:1' ? 'nodes.json' : 'variant.json')).map(a => ({ ...a, packageCommit: null, appPath: null, captureKind: a.file.endsWith('.png') ? 'figma-node-export' : 'figma-node-attributes', viewport: { width: 1, height: 1 }, deviceScaleFactor: 1 })),
  });
  return { root, index, manifest, run: (mode = 'coverage', packageCommit = PACKAGE) => verifyFigmaCoverage(manifest, index, { root, mode, packageCommit }) };
}
function accept(f) {
  for (const c of f.manifest.cases) {
    c.status = 'accepted';
    for (const kind of ['electron-screenshot', 'electron-interaction', 'electron-font-audit', 'electron-visual-comparison']) {
      const file = c.caseId.replace(':', '-') + '-' + kind + (kind === 'electron-screenshot' ? '.png' : '.json');
      const record = { caseId: c.caseId, packageCommit: PACKAGE, captureKind: kind, passed: true, steps: [{ passed: true }], nodes: [{ loaded: true, actualFonts: ['Noto Sans SC'], expectedFonts: ['Noto Sans SC'] }], referenceSha256: sha256(PNG), screenshotSha256: sha256(PNG), maxGeometryErrorCssPx: 0, materialsMatch: true, textWrapMatch: true, statesMatch: true };
      const bytes = kind === 'electron-screenshot' ? PNG : Buffer.from(JSON.stringify(record));
      fs.writeFileSync(path.join(f.root, file), bytes);
      c.runtimeEvidence.push({ file, sha256: sha256(bytes), packageCommit: PACKAGE, appPath: '/Applications/Test.app', captureKind: kind, viewport: { width: 1, height: 1 }, deviceScaleFactor: 1, caseId: c.caseId, designFingerprint: f.manifest.designFingerprint });
    }
  }
}
describe('Figma coverage provenance gates', () => {
  it('separates complete design coverage from current-package acceptance', () => {
    const f = fixture(); expect(f.run('design').ok).toBe(true);
    const result = f.run('acceptance'); expect(result.ok).toBe(false); expect(result.errors.some(e => e.reason.includes('Unaccepted'))).toBe(true);
  });
  it('fails for missing frames, variants, duplicate IDs and implementation paths', () => {
    const f = fixture(); f.manifest.cases = [f.manifest.cases[0], structuredClone(f.manifest.cases[0])];
    f.manifest.cases[0].implementationFiles = ['missing.js'];
    const reasons = f.run().errors.map(e => e.reason).join(' ');
    expect(reasons).toContain('duplicate'); expect(reasons).toContain('Missing indexed component variant'); expect(reasons).toContain('does not exist');
    f.manifest.cases = []; expect(f.run().errors.some(e => e.reason === 'Missing indexed screen frame')).toBe(true);
  });
  it('requires explicit local supersession and never counts it as accepted', () => {
    const f = fixture(); const c = f.manifest.cases[0]; c.status = 'superseded';
    expect(f.run().ok).toBe(false); c.replacesBy = '9:9'; c.supersededScope = 'Only old spacing';
    expect(f.run().errors.some(e => e.reason.includes('Replacement node'))).toBe(true); c.replacesBy = '2:1';
    const result = f.run(); expect(result.ok).toBe(true); expect(result.scope.accepted).toBe(0); expect(result.scope.superseded).toBe(1);
  });
  it('fails if evidence is missing or changed even when filenames remain the same', () => {
    const f = fixture(); fs.writeFileSync(path.join(f.root, 'reference.png'), 'changed');
    expect(f.run().errors.some(e => e.reason.includes('changed'))).toBe(true);
    fs.rmSync(path.join(f.root, 'nodes.json')); expect(f.run().errors.some(e => e.reason.includes('Missing evidence'))).toBe(true);
  });
  it('requires explicit package SHA and all four real evidence classes', () => {
    const f = fixture(); accept(f); expect(f.run('acceptance').ok).toBe(true);
    expect(verifyFigmaCoverage(f.manifest, f.index, { root: f.root, mode: 'acceptance' }).ok).toBe(false);
    f.manifest.cases[0].runtimeEvidence.pop(); expect(f.run('acceptance').ok).toBe(false);
  });
  it('rejects stale packages, stale design baselines, static clones and mixed app bundles', () => {
    const f = fixture(); accept(f); const e = f.manifest.cases[0].runtimeEvidence;
    e[0].captureKind = 'controlled-dom-clone'; e[1].packageCommit = 'b'.repeat(40); e[2].designFingerprint = 'old'; e[3].appPath = '/Applications/Other.app';
    const reasons = f.run('acceptance').errors.map(x => x.reason).join(' ');
    expect(reasons).toContain('Non-client'); expect(reasons).toContain('different or unspecified package'); expect(reasons).toContain('predates'); expect(reasons).toContain('mixes different');
  });
  it('binds comparison to exact images and checks PNG dimensions', () => {
    const f = fixture(); accept(f); const e = f.manifest.cases[0].runtimeEvidence; e[0].viewport.width = 2;
    const comparison = e.find(x => x.captureKind === 'electron-visual-comparison');
    const p = path.join(f.root, comparison.file); const record = JSON.parse(fs.readFileSync(p, 'utf8')); record.screenshotSha256 = 'wrong'; fs.writeFileSync(p, JSON.stringify(record)); comparison.sha256 = sha256(fs.readFileSync(p));
    const reasons = f.run('acceptance').errors.map(x => x.reason).join(' '); expect(reasons).toContain('Screenshot pixels'); expect(reasons).toContain('not bound');
  });
  it('reports malformed comparison evidence without crashing', () => {
    const f = fixture(); accept(f); const e = f.manifest.cases[0].runtimeEvidence.at(-1);
    fs.writeFileSync(path.join(f.root, e.file), '{'); e.sha256 = sha256(Buffer.from('{'));
    expect(() => f.run('acceptance')).not.toThrow(); expect(f.run('acceptance').ok).toBe(false);
  });
  it('does not promote unresolved differences or incomplete font/interaction records', () => {
    const f = fixture(); accept(f); f.manifest.cases[0].differences = [{ status: 'open' }];
    const e = f.manifest.cases[0].runtimeEvidence.find(x => x.captureKind === 'electron-font-audit');
    const p = path.join(f.root, e.file); const r = JSON.parse(fs.readFileSync(p)); r.nodes = []; fs.writeFileSync(p, JSON.stringify(r)); e.sha256 = sha256(fs.readFileSync(p));
    expect(f.run('acceptance').errors.some(x => x.reason.includes('Unresolved'))).toBe(true); expect(f.run('acceptance').errors.some(x => x.reason.includes('Font evidence'))).toBe(true);
  });
  it('does not silently skip additional cross-state combinations at acceptance', () => {
    const f = fixture(); accept(f); f.manifest.additionalCombinationRequirements = ['Settings open while a background task completes'];
    expect(f.run('coverage').ok).toBe(true); expect(f.run('coverage').warnings).toHaveLength(1);
    expect(f.run('acceptance').errors.some(e => e.caseId === 'combination-1')).toBe(true);
  });
  it('rejects a shadow-expanded PNG falsely labelled as application-sized', () => {
    const f = fixture(); const e = f.manifest.cases[0].designEvidence.find(x => x.captureKind === 'figma-node-export');
    e.viewport.width = 2; expect(f.run('design').errors.some(x => x.reason.includes('export boundary'))).toBe(true);
    e.viewport.width = 1; e.exportBoundary = 'absolute-render-bounds'; expect(f.run('design').errors.some(x => x.reason.includes('application region'))).toBe(true);
    e.applicationRegion = { x: 0, y: 0, width: 1, height: 1 }; expect(f.run('design').ok).toBe(true);
  });
  it('rejects deletion of a reviewed nested state even if its containing frame and inline inventory remain', () => {
    const f = fixture();
    const file = path.join(f.root, 'substates.json'); const review = JSON.parse(fs.readFileSync(file));
    review.frames[0].productStateIds.push('1:2'); fs.writeFileSync(file, JSON.stringify(review));
    f.manifest.substateIndex.sha256 = sha256(fs.readFileSync(file));
    f.manifest.designFingerprint = sha256(Buffer.from(JSON.stringify(f.manifest.designAssets.map(x => [x.file, x.sha256]))));
    const nested = structuredClone(f.manifest.cases[0]); Object.assign(nested, { caseId: 'nested-dialog', subnodeId: '1:2', role: 'nested-state' });
    f.manifest.cases.push(nested); expect(f.run('design').ok).toBe(true);
    f.manifest.cases.pop(); f.manifest.inventory = [{ frameId: '1:1', productStateIds: ['1:1'] }];
    expect(f.run('design').errors.some(e => e.caseId === '1:1--1:2' && e.reason === 'Missing reviewed nested product state')).toBe(true);
  });
  it('rejects attributing a real node to another frame', () => {
    const f = fixture(); f.manifest.cases[0].subnodeId = '2:1';
    expect(f.run().errors.some(e => e.reason === 'Substate node belongs to a different captured frame')).toBe(true);
  });
  it('rejects a missing geometry metric and a loaded fallback font', () => {
    const f = fixture(); accept(f);
    for (const kind of ['electron-visual-comparison', 'electron-font-audit']) {
      const e = f.manifest.cases[0].runtimeEvidence.find(x => x.captureKind === kind); const p = path.join(f.root, e.file);
      const r = JSON.parse(fs.readFileSync(p));
      if (kind === 'electron-visual-comparison') delete r.maxGeometryErrorCssPx;
      else r.nodes[0].actualFonts = ['Arial'];
      fs.writeFileSync(p, JSON.stringify(r)); e.sha256 = sha256(fs.readFileSync(p));
    }
    const reasons = f.run('acceptance').errors.map(e => e.reason).join(' ');
    expect(reasons).toContain('Visual comparison lacks geometry'); expect(reasons).toContain('matching expected families');
  });
});
