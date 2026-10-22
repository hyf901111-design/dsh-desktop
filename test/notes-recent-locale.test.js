import {afterEach,expect,it} from 'vitest'
import * as locale from '../packages/dsh-research-task-runtime/notes-locale.js'

afterEach(()=>{delete globalThis.document})

it('translates the recent challenge and component controls through explicit UI keys',()=>{
 for(const [key,value]of Object.entries({'AI挑战':'AI Challenge','AI优化':'AI optimize','检查覆盖':'Review coverage','组件样式':'Component style','跟随客户端':'Follow app theme','笔记任务过程':'Note activity','探索更远，洞见更深':'Explore further, see deeper'}))expect(locale.noteUiText(key,'en')).toBe(value)
 expect(locale.noteUiText('挑战模式，当前{level}','en').replace('{level}',locale.noteUiText('标准','en'))).toBe('Challenge mode: Standard')
 expect(locale.noteUiText('段落经{level}模式 AI 挑战校对，当前有 {count} 处未解决问题','en').replace('{level}','Standard').replace('{count}','3')).toBe('Reviewed in Standard mode; 3 unresolved issues')
})

it('renders only known fixed review details and exact bounded count templates in English',()=>{
 expect(locale.noteChallengeCheckText('挑战模式已关闭。','en')).toBe('Challenge mode is off.')
 expect(locale.noteChallengeCheckText('本次实际审查2/4个待检查正文块；只检查本次正文及已提供的局部原文对照，未核验外部事实。','en')).toBe('Reviewed 2/4 pending text blocks using only this note and the supplied local source excerpts; external facts were not verified.')
 expect(locale.noteChallengeCheckText('深度复查实际覆盖1/2个正文块；新增问题仍仅依据正文或标明未联网的常识筛查。','en')).toContain('1/2')
 const native='模型原生内容：挑战模式已关闭。\n用户正文和任意来源不得翻译。'
 expect(locale.noteChallengeCheckText(native,'en')).toBe(native)
 expect(locale.noteChallengeCheckText('本次实际审查-2/4个待检查正文块；只检查本次正文及已提供的局部原文对照，未核验外部事实。','en')).toContain('本次实际审查')
 expect(locale.noteChallengeCheckText('挑战模式已关闭。','zh')).toBe('挑战模式已关闭。')
})

it('translates recognized note IPC errors while preserving unknown service and model errors',()=>{
 expect(locale.noteUiError("Error invoking remote method 'notes:request': Error: 检查服务尚未就绪。",'en')).toBe('The review service is not ready.')
 const unknown="Error invoking remote method 'notes:request': Error: 私有来源原生错误：正文未改。"
 expect(locale.noteUiError(unknown,'en')).toBe(unknown)
 expect(locale.noteUiError("Error invoking remote method 'other:request': Error: 检查服务尚未就绪。",'en')).toContain('other:request')
 expect(locale.noteUiError('检查服务尚未就绪。','zh')).toBe('检查服务尚未就绪。')
 expect(locale.noteUiError('智能组件','en')).toBe('智能组件')
})

it('localizes independent review phases without rewriting model explanations',()=>{
 const notices=[
  '主检查阶段未完成，已保留预算用于独立复查；未将未完成段落视为通过。',
  '部分正文块检查未完成，已保留此前验证结果；未将失败块视为通过。',
  '观点拓展阶段预算不足，未将抬杠维度视为完成。',
  '观点拓展未完成或回执不完整；保留已验证问题，未将抬杠维度视为完成。',
  '研究元数据与待检查段落超出本轮容量，相关段落已保留为待检查，尚未完成本等级检查。',
  '观点拓展实际完成3/8个正文块；允许确无适用追问，不将纠错问句当作观点拓展。'
 ]
 for(const text of notices){
  expect(locale.noteChallengeCheckText(text,'en')).not.toMatch(/[\u4e00-\u9fff]/u)
  expect(locale.noteChallengeCheckText(text,'zh')).toBe(text)
  const quoted='用户自己的解释：'+text
  expect(locale.noteChallengeCheckText(quoted,'en')).toBe(quoted)
 }
 expect(locale.noteChallengeCheckText(notices.at(-1),'en')).toContain('3/8')
})

it('uses the current display locale without changing stored review text or user content',()=>{
 const saved={detail:'挑战模式已关闭。'},body='用户中文正文：智能组件和标题',before=JSON.stringify(saved)
 globalThis.document={documentElement:{dataset:{odysseyLocale:'en'}}}
 expect(locale.noteChallengeCheckText(saved.detail)).toBe('Challenge mode is off.')
 globalThis.document.documentElement.dataset.odysseyLocale='zh'
 expect(locale.noteChallengeCheckText(saved.detail)).toBe(saved.detail)
 expect(JSON.stringify(saved)).toBe(before);expect(locale.noteUiText(body,'en')).toBe(body)
})

it('formats actual consensus dates and complete fixed notice groups without changing opaque text',()=>{
 expect(locale.noteChallengeCheckText('600519.SH 2027年度归母净利润已按20261021快照比较。','en')).toBe('Compared 600519.SH FY2027 Net profit attributable to shareholders using the 20261021 snapshot.')
 const joined='预测家数3，样本有限，不作C2/C3强判断；中值为空或零，不作相对偏离判断；报告基准日20261020无快照，已回退至最新EST_DT=20261021比较；仅作事后参考，不能据此认定历史报告当时有误'
 const english=locale.noteChallengeCheckText(joined,'en');expect(english).toContain('Forecast institutions: 3');expect(english).toContain('20261020');expect(english).toContain('EST_DT=20261021');expect(english).toContain('historical report')
 const native=joined+'；模型自行解释：保留这句中文。'
 expect(locale.noteChallengeCheckText(native,'en')).toBe(native)
})
