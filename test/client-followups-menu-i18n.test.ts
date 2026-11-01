import {expect,it} from 'vitest'
import {noteUiText} from '../packages/dsh-research-task-runtime/notes-locale.js'
import {translateUiCopy} from '../src/preload/ui-localization'

it('localizes account identity chrome and the four component theme actions without rewriting authored content',()=>{
 expect(translateUiCopy('用户 ID：1915049228')).toBe('User ID: 1915049228')
 expect(translateUiCopy('复制用户 ID')).toBe('Copy user ID')
 for(const label of ['模式切换','组件模式','浅色模式','深色模式','易方达模式','彭博模式','语音输入','停止语音输入','请先停止语音输入再发送','等待麦克风权限','正在识别','正在聆听','当前客户端暂不支持语音输入，请使用 macOS 本地客户端。','无法开始语音输入，请重试。'])expect(translateUiCopy(label)).not.toMatch(/[\u4e00-\u9fff]/u)
 for(const value of ['我的用户 ID：1915049228','用户 ID：不是公开数字','这段笔记的编辑模式与彭博模式','研究员自定义标题','使用语音输入写这段笔记'])expect(translateUiCopy(value)).toBe(value)
})
it('translates fixed native table actions but keeps saved/custom slash component titles intact',()=>{
 const labels=['原生表格操作','表格操作','行操作','列操作','标题行','标题列','适应正文','均分列宽','表格宽度','当前行','当前列','删除表格','在上方插入行','在下方插入行','上移此行','下移此行','删除此行','在左侧插入列','在右侧插入列','左移此列','右移此列','删除此列','调整表格整体宽度','添加列','添加行','在此处插入列','在此处插入行','内置组件','自定义组件','行情面板','市场指数','自选','新闻列表','公告列表','日历']
 for(const label of labels){expect(noteUiText(label,'en')).not.toMatch(/[\u4e00-\u9fff]/u);expect(noteUiText(label,'zh')).toBe(label)}
 expect(noteUiText('用户创建的行情面板','en')).toBe('用户创建的行情面板')
})
it('limits inline confirmation translation to fixed host feedback and exact numeric summaries',()=>{
 expect(noteUiText('已生成1项内容、2个组件','en')).toBe('Generated 1 content block and 2 components')
 expect(noteUiText('已保留2项内容、1个组件，部分未完成','en')).toBe('Kept 2 content blocks and 1 component; some work is incomplete')
 for(const label of ['已插入表格','已更新原生笔记内容','已生成文字','已生成文字，组件未生成','已生成文字，部分组件未生成；原组件内容已保留'])expect(noteUiText(label,'en')).not.toMatch(/[\u4e00-\u9fff]/u)
 expect(noteUiText('已生成1项内容：市场风险仍需复核','en')).toBe('已生成1项内容：市场风险仍需复核')
})
