import { expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { renderInteractiveArtifact } from '../packages/dsh-research-task-runtime/interactive-artifact.js';
import { compactHostDashboardHtml } from '../packages/dsh-research-task-runtime/html-artifact.js';

it('shows a short metric note once and reserves disclosure for a full methodology', () => {
  const output=renderInteractiveArtifact({version:1,type:'dashboard',title:'运营指标',asOf:'模拟数据',items:[
    {label:'已完成报告',value:'42 篇',detail:'本月累计'},
    {label:'按期完成率',value:'91.4%',detail:'按照原计划完成且通过负责人复核的研究报告占全部计划报告的比例，同时排除撤销和重复登记的任务。'}
  ]});
  const window=new Window();
  window.document.write(output.html);
  const cards=window.document.querySelectorAll('.research-metric');
  expect(cards[0].querySelector('.research-metric-detail').textContent).toBe('本月累计');
  expect(cards[0].querySelector('details')).toBeNull();
  expect(cards[1].querySelector('details summary').textContent).toBe('查看口径');
  window.close();
  const previous=output.html.replace('<p class="research-metric-detail">本月累计</p>',
    '<p class="research-metric-detail">本月累计</p><details><summary>详情</summary><p>本月累计</p></details>');
  expect(compactHostDashboardHtml(previous)).not.toContain('<summary>详情</summary><p>本月累计</p>');
});

it('opens a dated calendar on its month with a dedicated compact control row', () => {
  const output = renderInteractiveArtifact({ version: 1, type: 'calendar', title: '模拟事件日历', items: [
    { title: '模拟公告', summary: '发布日期', date: '2026-02-06', category: '公告' },
    { title: '模拟会议', summary: '会议时间', date: '2026-02-08', category: '会议' }
  ] });
  expect(output).toBeDefined();
  const window = new Window();
  window.document.write(output.html);
  expect(window.document.querySelector('#month').value).toBe('2026-02');
  expect(window.document.querySelector('.controls')).toBeNull();
  expect(window.document.querySelector('#clear-day').textContent).toBe('清除选择');
  expect(window.document.querySelector('style').textContent).toContain('grid-template-columns:minmax(0,1fr) 180px');
  expect(window.document.querySelector('.agenda-head').textContent).toContain('本月安排');
  window.close();
});

it('keeps a finance news feed compact, searchable, and honest about missing source links', () => {
  const output=renderInteractiveArtifact({version:1,type:'news',title:'模拟行业资讯',items:[
    {title:'模拟医药研发节点更新',summary:'关注试验终点与后续申报节奏。',date:'2026-06-30',time:'14:32',category:'行业'},
    {title:'模拟公告跟踪',summary:'公告内容待研究组复核。',date:'2026-06-30',time:'11:06',category:'公告',url:'https://example.org/mock'}
  ]});
  const win=new Window();win.document.write(output.html);
  const rows=win.document.querySelectorAll('.research-feed-item');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('time').textContent).toBe('2026-06-30 14:32');
  expect(rows[0].querySelector('.feed-category').textContent).toBe('行业');
  expect(rows[0].querySelector('a')).toBeNull();
  expect(rows[0].textContent).not.toContain('来源链接未提供');
  expect(rows[1].querySelector('a').getAttribute('href')).toBe('https://example.org/mock');
  expect(win.document.querySelector('#search')).not.toBeNull();
  expect(win.document.querySelector('#category')).not.toBeNull();
  expect(compactHostDashboardHtml(output.html)).toBe(output.html);
  const legacy=output.html.replaceAll('class="feed-meta"','class="meta"').replaceAll('class="feed-copy"','class="legacy-copy"');
  expect(compactHostDashboardHtml(legacy)).toContain('data-sherlock-feed-refined');
  expect(compactHostDashboardHtml(compactHostDashboardHtml(legacy))).toBe(compactHostDashboardHtml(legacy));
  win.close();
});
