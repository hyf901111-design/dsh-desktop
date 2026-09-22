import { describe, expect, it } from 'vitest'
import { designPolicyIssue } from '../packages/dsh-research-task-runtime/design-policy.js'

describe('generated HTML design policy', () => {
 it.each([
  '<style>:root{--sherlock-text:purple}</style><p>内容</p>',
  '<p style="--sherlock-control-primary:blue">内容</p>',
  '<style>:root{--sherlock-\\74 ext:red}</style><p>内容</p>',
  '<script>document.documentElement.style.setProperty("--sherlock-control-bg","blue")</script><p>内容</p>',
  '<button onclick="document.documentElement.style.setProperty(\'--sherlock-control-bg\',\'blue\')">筛选</button>',
  '<style>@property --sherlock-control-bg{syntax:"<color>";inherits:true;initial-value:blue}</style><button>筛选</button>'
 ])('rejects an actual host token redefinition: %s', html => expect(designPolicyIssue(html)).toContain('宿主变量'))
 it.each([
  '<style>.action:hover{background:#1677ff}</style><button class="action">筛选</button>',
  '<button><span style="color:rgb(0,0,255)">筛选</span></button>',
  '<style>input:focus{outline:1px solid var(--sherlock-chart-1)}</style><input>',
  '<style>button{color:var(--sherlock-accent)}</style><button>筛选</button>',
  '<button><svg><path fill="var(--sherlock-status-danger-fg)" d="M0 0L1 1"/></svg></button>',
  '<div role="tab" style="background:blue">月度</div>',
  '<style>.actions{color:blue}</style><div class="actions"><button>筛选</button></div>',
  '<style>button{background:cornflowerblue}</style><button>筛选</button>',
  '<style>button{&:hover{color:var(--sherlock-chart-1)}}</style><button>筛选</button>'
 ])('rejects authored color or business-color tokens on controls: %s', html => expect(designPolicyIssue(html)).toContain('控件'))
 it.each([
  '<style>body{font-family:Arial,sans-serif}</style><p>内容</p>',
  '<style>@font-face{font-family:Custom;src:url(data:font/woff2;base64,AA)}</style><p>内容</p>',
  '<style>body{font-family:var(--sherlock-font-sans),Arial}</style><p>内容</p>',
  '<p>内容</p><script>document.body.style.fontFamily="Arial"</script>'
 ])('rejects font replacement: %s', html => expect(designPolicyIssue(html)).toContain('字体'))
 it('accepts standard neutral controls and business chart/status tokens together', () => {
  expect(designPolicyIssue('<style>body{font-family:var(--sherlock-font-sans);color:var(--sherlock-text)}button:hover{background:var(--sherlock-control-primary);color:var(--sherlock-control-on-primary)}.profit{color:var(--sherlock-status-danger-fg)}</style><button>筛选</button><span class="profit" data-sherlock-status="danger">+2.4%</span><svg><path stroke="var(--sherlock-chart-1)" d="M0 0L1 1"/></svg>')).toBeNull()
 })
 it('does not interpret documentation, comments, script strings or data series as control styling', () => {
  expect(designPolicyIssue('<p>示例 button{color:blue}，数据字段 --sherlock-text</p><!-- <style>button{color:blue}</style> --><script>const documentation="button{color:blue}";</script><svg aria-label="来源报告的蓝色系列"><path fill="#1677ff" d="M0 0L1 1"/></svg>')).toBeNull()
 })
 it('accepts inherited controls without mandatory author CSS', () => expect(designPolicyIssue('<label>月份<select><option>三月</option></select></label><button>查看</button>')).toBeNull())
 it('rejects malformed author CSS with a repairable explanation', () => expect(designPolicyIssue('<style>button{color:blue</style><button>查看</button>')).toContain('CSS'))
})
