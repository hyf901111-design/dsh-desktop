import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
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
