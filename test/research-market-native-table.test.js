import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { retainTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js';
import { renderMarketArtifact } from '../packages/dsh-research-task-runtime/market-artifact.js';
import { parseResearchMarketNativeTable, researchMarketNativeTableCss } from '../scripts/lib/research-market-native-table.mjs';

describe('host market table text rendering', () => {
  it('retains the observed valuation date and all 336 characters of source methodology after serialization', () => {
    const observed = JSON.parse(readFileSync(new URL('./fixtures/workbench-native-valuation-observed.json', import.meta.url), 'utf8'));
    const win = new Window();
    const html = renderMarketArtifact(observed).html;
    const parse = new Function(`return (${parseResearchMarketNativeTable.toString()})`)();
    const parsed = parse(html, win.document);
    expect(observed.note).toHaveLength(336);
    expect(parsed.footer.map(line => line.map(part => part.text).join(''))).toEqual([observed.asOf, observed.note]);
    expect(parsed.rows.map(row => row.map(cell => cell.text))).toEqual(observed.rows);
    win.happyDOM.abort();
  });
  it('uses readable native text at the source card width', () => {
    expect(researchMarketNativeTableCss).toContain('font:14px/20px');
    expect(researchMarketNativeTableCss).toContain('th{font-size:11px;line-height:16px');
    expect(researchMarketNativeTableCss).not.toContain('font:11px/14px');
  });
  it('recovers escaped cell text and tones from the contracted template', () => {
    const win = new Window();
    const artifact = renderMarketArtifact({
      version: 1, type: 'market', variant: 'table', title: '银行明细', asOf: '模拟数据',
      columns: ['银行名称', '最新价(元)'], rows: [['招商银行', '38.56'], ['A < B', '9.15']],
      tones: [['neutral', 'positive'], ['neutral', 'negative']]
    });
    const parsed = parseResearchMarketNativeTable(artifact.html, win.document);
    expect(parsed).toEqual({ footer: [[{text:'模拟数据'}]], variant: 'table', columns: ['银行名称', '最新价(元)'], rows: [
      [{ text: '招商银行', tone: 'neutral' }, { text: '38.56', tone: 'positive' }],
      [{ text: 'A < B', tone: 'neutral' }, { text: '9.15', tone: 'negative' }]
    ] });
    expect(win.document.querySelector('table')).toBeNull();
    win.happyDOM.abort();
  });

  it('preserves the complete OpenTerminal table instead of extracting only its cells', () => {
    const win = new Window();
    const artifact = renderMarketArtifact({version:1,type:'market',variant:'table',title:'模拟观察池',asOf:'模拟',layoutProfile:'openterminal',columns:['名称','价格（元）'],rows:[['示例','0']],note:'来源口径完整保留'});
    expect(artifact.html).toContain('ot-table-context');
    expect(artifact.html).toContain('来源口径完整保留');
    expect(parseResearchMarketNativeTable(artifact.html,win.document)).toBeNull();
    win.happyDOM.abort();
  });

  it('leaves arbitrary HTML and other market variants inside their sandbox', () => {
    const win = new Window();
    expect(parseResearchMarketNativeTable('<table><tr><td>not contracted</td></tr></table>', win.document)).toBeNull();
    expect(parseResearchMarketNativeTable(renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'指标',asOf:'模拟',items:[{label:'值',value:'1'}]}).html, win.document)).toBeNull();
    win.happyDOM.abort();
  });
});

const model = {version:1,type:'market',variant:'table',title:'投影样本',asOf:'2026-10-21 · 既有快照',columns:['名称','值'],rows:[['A < B','1.23456789']]};
const project = html => {
  const win = new Window();
  try { return new Function(`return (${parseResearchMarketNativeTable.toString()})`)()(html, win.document); }
  finally { win.happyDOM.abort(); }
};
it('projects note-only, escaped text, complete long notes and empty sources without creating HTML', () => {
  for (const note of ['日期与口径 <script>alert(1)</script> & "保持文本"', '注'.repeat(1998) + '终点']) {
    const html = renderMarketArtifact({...model,note,sources:[]}).html;
    expect(project(html).footer).toEqual([[{text:model.asOf}],[{text:note}]]);
  }
  const html = renderMarketArtifact(model).html;
  expect(html).not.toContain('<footer');
  expect(project(html).footer).toEqual([[{text:model.asOf}]]);
  expect(project(html.replace(/<meta name="sherlock-header-note"[^>]*>/,''))).not.toHaveProperty('footer');
});
it('preserves footer order and exact safe hrefs for sources and cell details', () => {
  const sources=[{label:'来源 <甲>',url:'https://example.com/a?x=1&y=2#片段'},{label:'仅文本来源'}];
  const href='https://example.org/detail?code=A&view=full';
  const html=renderMarketArtifact({...model,note:'完整备注',sources,rowLinks:[href]}).html;
  const parsed=project(html);
  expect(parsed.rows[0][0]).toEqual({text:'A < B',tone:'neutral',parts:[{text:'A < B',href}]});
  expect(parsed.footer).toEqual([[{text:model.asOf}],[{text:'完整备注'}],[{text:'来源 <甲> ↗',href:sources[0].url},{text:' · '},{text:'仅文本来源'}]]);
  const dated=html.replace('<footer class="market-footer">','<footer class="market-footer"><span class="market-asof">已渲染日期</span>');
  expect(project(dated).footer[0]).toEqual([{text:'已渲染日期'}]);
});
it.each(['javascript:alert(1)','data:text/html,evil','file:///tmp/x','https://user:secret@example.com/x','http://localhost/x','http://127.0.0.1/x','http://[::1]/x','/relative','https://example.com/'+ 'x'.repeat(8192),'https://example.com/'+'文'.repeat(1000)])('keeps unsafe or unrouteable link %s in the complete sandbox', href => {
  const html=renderMarketArtifact({...model,note:'备注',sources:[{label:'来源',url:'https://example.com/'}]}).html;
  expect(project(html.replace('href="https://example.com/"',`href="${href}"`))).toBeNull();
});
it.each([
  html=>html.replace('</body>','<h2>不可丢失</h2></body>'),
  html=>html.replace('<span>备注</span>','<span><b>备注</b></span>'),
  html=>html.replace('<span>备注</span>','<img alt="不可丢失">'),
  html=>html.replace('<span>备注</span>','<span onclick="alert(1)">备注</span>'),
  html=>html.replace('<span>备注</span>','<span hidden>备注</span>'),
  html=>html.replace('</body>','<script>unknown()</script></body>'),
  html=>html.replace('const table=document','const table=unknown;document'),
  html=>html.replace('>A &lt; B</td>','><strong>A &lt; B</strong></td>'),
  html=>html.replace('>名称</button>','>名称<a href="https://example.com">更多</a></button>'),
  html=>html.replace('<td data-numeric=','<td style="color:transparent" data-numeric='),
  html=>html.replace('<table>','<table><caption>不可丢失</caption>'),
  html=>html.replace('class="terminal-table-readout" role="status"></div>','class="terminal-table-readout" role="status">不可丢失</div>')
])('falls back for unknown compositions instead of silently flattening them', mutate => {
  expect(project(mutate(renderMarketArtifact({...model,note:'备注'}).html))).toBeNull();
});
it('retains holdings simulation metadata and visible period/footer while keeping native limits', () => {
  const parsed=project(renderMarketArtifact({...model,variant:'fund-holdings',asOf:'演示数据',period:'2026年三季报'}).html);
  expect(parsed.simulated).toBe(true);
  expect(parsed.footer.flat().map(p=>p.text)).toEqual(['演示数据','基金池：模拟基金池','数据期间：2026年三季报','模拟数据 · 1 条 · 可搜索与排序']);
  for (const count of [12,13,32]) {
    const html=renderMarketArtifact({...model,columns:Array.from({length:count},(_,i)=>'列'+i),rows:[Array(count).fill('值')]}).html;
    expect(project(html) === null).toBe(count>12);
  }
});


it.each([
  ['extra tbody TH', html=>html.replace('<tbody><tr>','<tbody><tr><th>不可丢失的行标题</th>')],
  ['extra thead TD', html=>html.replace('<thead><tr>','<thead><tr><td>不可丢失的表头数据</td>')],
  ['two header rows with unchanged total width', html=>html.replace('<th data-numeric="true">','</tr><tr><th data-numeric="true">')],
  ['two thead sections with unchanged total width', html=>html.replace('<th data-numeric="true">','</tr></thead><thead><tr><th data-numeric="true">')],
  ['two tbody sections', html=>html.replace('</tbody>','</tbody><tbody><tr><td>另一区</td><td>另一区值</td></tr></tbody>')],
  ['body TH replaces TD', html=>html.replace('<tbody><tr><td data-numeric="false" data-tone="neutral">A &lt; B</td>','<tbody><tr><th>A &lt; B</th>')],
  ['header TD replaces TH', html=>html.replace('<th data-numeric="false"><button data-column="0" aria-label="按名称排序">名称</button></th>','<td>名称</td>')]
])('keeps unsupported table hierarchy in the sandbox: %s', (_, mutate) => {
  const html=renderMarketArtifact(model).html;
  expect(mutate(html)).not.toBe(html);
  expect(project(mutate(html))).toBeNull();
});
it('projects every cell of the supported single-header and multi-data-row hierarchy', () => {
  const supported={...model,columns:['行标题 <文本>','完整值'],rows:[['正文 <甲>','1.23456789'],['正文 <乙>','精度与缺失说明']]};
  const parsed=project(renderMarketArtifact(supported).html);
  expect(parsed.columns).toEqual(supported.columns);
  expect(parsed.rows.map(row=>row.map(cell=>cell.text))).toEqual(supported.rows);
});
it('accepts actual persisted host shape with inert retained metadata through serialized parser', () => {
  const observed=JSON.parse(readFileSync(new URL('./fixtures/workbench-native-valuation-observed.json', import.meta.url),'utf8'));
  const persisted=retainTemplateModel(renderMarketArtifact(observed),observed);
  expect(persisted.html).toHaveLength(79846);
  expect(persisted.html).toContain('<script id="sherlock-template-data" type="application/json">');
  const parsed=project(persisted.html);
  expect(parsed).not.toBeNull();
  expect(parsed.columns).toEqual(observed.columns);
  expect(parsed.rows.map(row=>row.map(cell=>cell.text))).toEqual(observed.rows);
  expect(parsed.footer).toEqual([[{text:observed.asOf}],[{text:observed.note}]]);
});


const withRetained = () => retainTemplateModel(renderMarketArtifact(model),model).html;
const replaceMetadata = (html, text) => html.replace(/(<script id="sherlock-template-data" type="application\/json">)[\s\S]*?(<\/script>)/, (_,open,close) => open+text+close);
it.each([
  ['executable MIME type', html=>html.replace('id="sherlock-template-data" type="application/json"','id="sherlock-template-data" type="text/javascript"')],
  ['unknown metadata id', html=>html.replace('id="sherlock-template-data"','id="unknown-data"')],
  ['extra src attribute', html=>html.replace('id="sherlock-template-data"','id="sherlock-template-data" src="https://example.com/unknown.js"')],
  ['extra executable script', html=>html+'<script>window.mustNotExecute=true</script>'],
  ['duplicate retained block', html=>html+html.match(/<script id="sherlock-template-data"[\s\S]*?<\/script>/)[0]],
  ['invalid JSON', html=>replaceMetadata(html,'window.mustNotExecute=true')],
  ['unknown envelope fields', html=>replaceMetadata(html,JSON.stringify({templateId:'market.table',version:'21m-20260923-v1',data:model,extra:true}))],
  ['wrong template id', html=>html.replace('"templateId":"market.table"','"templateId":"market.unknown"')],
  ['wrong retained version', html=>replaceMetadata(html,JSON.stringify({templateId:'market.table',version:'unknown',data:model}))],
  ['wrong data variant', html=>replaceMetadata(html,JSON.stringify({templateId:'market.table',version:'21m-20260923-v1',data:{...model,variant:'metrics'}}))],
  ['null data', html=>replaceMetadata(html,JSON.stringify({templateId:'market.table',version:'21m-20260923-v1',data:null}))],
  ['nonobject envelope', html=>replaceMetadata(html,'null')]
])('retains strict sandbox fallback for unrecognized persisted scripts: %s', (_, mutate) => {
  const html=withRetained();
  expect(mutate(html)).not.toBe(html);
  expect(project(mutate(html))).toBeNull();
});
it('uses complete visible HTML rather than retained metadata as the projection source', () => {
  const html=withRetained(),metadata={templateId:'market.table',version:'21m-20260923-v1',data:{...model,asOf:'不可推断日期',note:'不可提升的隐藏说明',rows:[['隐藏数据','999']],sources:[{label:'隐藏链接',url:'javascript:unknown()'}]}};
  const changed=replaceMetadata(html,JSON.stringify(metadata));
  expect(project(changed)).toEqual(project(html));
  expect(JSON.stringify(project(changed))).not.toContain('隐藏');
});
it('retains safe source and cell hrefs on production-persisted host HTML', () => {
  const linked={...model,note:'可见完整备注',sources:[{label:'来源',url:'https://example.com/source?a=1&b=2'}],rowLinks:['https://example.org/detail?id=A']};
  const direct=renderMarketArtifact(linked);
  expect(project(retainTemplateModel(direct,linked).html)).toEqual(project(direct.html));
  const holdings={...model,variant:'fund-holdings',asOf:'模拟数据'};
  expect(project(retainTemplateModel(renderMarketArtifact(holdings),holdings).html).simulated).toBe(true);
});
