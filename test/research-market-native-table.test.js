import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { renderMarketArtifact } from '../packages/dsh-research-task-runtime/market-artifact.js';
import { parseResearchMarketNativeTable, researchMarketNativeTableCss } from '../scripts/lib/research-market-native-table.mjs';

describe('host market table text rendering', () => {
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
    expect(parsed).toEqual({ variant: 'table', columns: ['银行名称', '最新价(元)'], rows: [
      [{ text: '招商银行', tone: 'neutral' }, { text: '38.56', tone: 'positive' }],
      [{ text: 'A < B', tone: 'neutral' }, { text: '9.15', tone: 'negative' }]
    ] });
    expect(win.document.querySelector('table')).toBeNull();
    win.happyDOM.abort();
  });

  it('leaves arbitrary HTML and other market variants inside their sandbox', () => {
    const win = new Window();
    expect(parseResearchMarketNativeTable('<table><tr><td>not contracted</td></tr></table>', win.document)).toBeNull();
    expect(parseResearchMarketNativeTable(renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'指标',asOf:'模拟',items:[{label:'值',value:'1'}]}).html, win.document)).toBeNull();
    win.happyDOM.abort();
  });
});
