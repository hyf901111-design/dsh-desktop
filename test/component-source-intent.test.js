import {expect,it} from 'vitest'
import {componentPluginSourceRequired as required,componentPluginSourceProhibited as prohibited} from '../packages/dsh-research-task-runtime/component-source-tools.js'

it.each(['数据源：通联 DataYes','数据来源为通联','来源是DataYes','必须使用已配置的MCP','只用DataYes取数','Use DataYes for actual data.'])('retains the explicit plugin source: %s',text=>expect(required(text)).toBe(true))
it.each(['可经 DataYes 接口发现或网页检索','可以通过通联或公开网页获取','优先使用已配置的MCP，失败可用网页','May use DataYes or a public source.'])('does not require an optional source: %s',text=>expect(required(text)).toBe(false))
it.each(['不要使用通联','禁止调用MCP','Do not use DataYes.','Never call MCP.'])('recognizes a prohibited source without making it mandatory: %s',text=>{expect(prohibited(text)).toBe(true);expect(required(text)).toBe(false)})
