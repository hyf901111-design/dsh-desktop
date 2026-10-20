import { expect, it } from 'vitest';
import {calendarWindow} from './helpers/calendar-window.js';
import { Window } from 'happy-dom';
import { runInNewContext } from 'node:vm';
import { renderInteractiveArtifact } from '../packages/dsh-research-task-runtime/interactive-artifact.js';
import { compactHostDashboardHtml } from '../packages/dsh-research-task-runtime/html-artifact.js';
import { CALENDAR_PRESENTATION_CSS } from '../packages/dsh-research-task-runtime/calendar-presentation.js';
import { WORKBENCH_PRESENTATION_CSS } from '../packages/dsh-research-task-runtime/workbench-presentation.js';

it('opens source-backed news and report titles without first expanding their summaries',()=>{
 for(const type of ['news','reports']){
  const output=renderInteractiveArtifact({version:1,type,title:'已取得真实资料',items:[
   {title:'公告与经营数据',summary:'原文核对入口',url:'https://example.com/source?a=1&b=2'},
   {title:'来源尚未取得',summary:'保留缺失说明'}
  ]});
  const w=new Window();w.document.write(output.html);
  const a=w.document.querySelector('.feed-copy h2 a');
  expect(a?.href).toBe('https://example.com/source?a=1&b=2');
  expect(a?.target).toBe('_blank');expect(a?.rel).toContain('noopener');
  expect(w.document.querySelector('details').open).toBe(false);
  expect(w.document.querySelectorAll('.feed-copy h2 a')).toHaveLength(1);
  w.close();
 }
});

it('calendar layout preserves six weeks, a separate footer and working saved interactions',()=>{
 const output=renderInteractiveArtifact({version:1,type:'calendar',title:'模拟事件日历',items:[
  {title:'行业例会',summary:'确认研究进度',date:'2026-07-03'},
  {title:'模型复核',summary:'检查假设与结果',date:'2026-08-31'}
 ]}),runtime=calendarWindow(output.html),w=runtime.window,doc=runtime.document;
 const select=doc.querySelector('#month');select.value='2026-08';select.dispatchEvent(new w.Event('change'));
 expect(doc.querySelector('#days').children).toHaveLength(42);
 expect(doc.querySelector('#days').querySelectorAll('button')).toHaveLength(42);
 doc.querySelector('[aria-label="2026-08-31"]').click();
 expect(doc.querySelector('[aria-pressed="true"]').textContent).toBe('31');
 expect(doc.querySelector('#agenda-title').textContent).toBe('8 月 31 日 · 1 项安排');
 expect(doc.querySelectorAll('.event')).toHaveLength(1);
 doc.querySelector('#clear-day').click();
 expect(doc.querySelector('[aria-pressed="true"]')).toBeNull();
 doc.querySelector('#previous').click();
 expect(select.value).toBe('2026-07');
 expect(doc.querySelector('#events').textContent).toContain('行业例会');
 expect(doc.querySelector('.agenda').previousElementSibling.className).toBe('month');
 expect(output.html).toContain(CALENDAR_PRESENTATION_CSS);
 expect(WORKBENCH_PRESENTATION_CSS).toContain(CALENDAR_PRESENTATION_CSS);
 w.close();
});

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
  expect(window.document.querySelector('#clear-day').textContent).toBe('查看本月');
  expect(window.document.querySelector('style').textContent).toContain('flex-direction:column!important');
  expect(window.document.querySelector('.agenda-head').textContent).toContain('2 月 6 日 · 1 项安排');
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
