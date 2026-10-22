import {expect,it} from 'vitest'
import {execFileSync} from 'node:child_process'
import {capabilityReceiptText,noteCapabilityReceiptMessage} from '../packages/dsh-research-task-runtime/client-capabilities.js'

it('keeps default runtime receipts byte-for-byte Chinese and explicitly renders English chrome',()=>{
 const receipts=[{capability:'notes.components.create',status:'succeeded',message:'已生成并保存组件'},{capability:'notes.components.style',status:'succeeded',message:'已保存 2 个组件的样式。',changedBlockIds:['a','b']},{capability:'notes.export',status:'succeeded',path:'/tmp/用户中文报告 $&.pdf'}],before=JSON.stringify(receipts)
 expect(capabilityReceiptText(receipts)).toBe('创建组件：已完成。已生成并保存组件\n组件样式：已完成。已保存 2 个组件的样式。\n导出笔记：已完成 — /tmp/用户中文报告 $&.pdf')
 expect(capabilityReceiptText(receipts,'en')).toBe('Create component: Completed. Component generated and saved\nComponent style: Completed. Saved styles for 2 components.\nExport note: Completed — /tmp/用户中文报告 $&.pdf')
 expect(JSON.stringify(receipts)).toBe(before)
})

it('preserves cancelled and unconfirmed effects without promoting them to success',()=>{
 const receipt={capability:'notes.components.style',status:'cancelled',effect:{state:'applied',changedBlockIds:['one','two']},message:'已应用但未确认保存 2 个组件的样式；后续操作已取消。'}
 expect(capabilityReceiptText([receipt],'en')).toBe('Component style: Cancelled. Applied styles to 2 components; saving is not yet confirmed; subsequent operations were cancelled.')
 const path='/tmp/原文$&${path}。报告.pdf',file={capability:'notes.export',status:'cancelled',effect:{state:'writing',path},message:'文件写入已开始，保存结果尚未确认：'+path+'；后续操作已取消。'}
 expect(noteCapabilityReceiptMessage(file,'en')).toBe('File writing started; saving is not yet confirmed: '+path+'; subsequent operations were cancelled.')
})

it('preserves native adapter details while translating only the recorded fixed effect prefix',()=>{
 const native='模型原生中文：这份用户材料有独立结论。',receipt={capability:'unknown.custom',status:'failed',message:native}
 expect(capabilityReceiptText([receipt],'en')).toBe('unknown.custom: Failed. '+native)
 expect(noteCapabilityReceiptMessage({message:'智能组件'},'en')).toBe('智能组件')
 const effect={state:'saved',changedBlockIds:['a']}
 expect(noteCapabilityReceiptMessage({effect,message:'已保存 1 个组件的样式。'+native},'en')).toBe('Saved styles for 1 components. '+native)
 expect(noteCapabilityReceiptMessage({message:'文件已保存：/tmp/用户文件.pdf',path:'/tmp/用户文件.pdf'},'en')).toBe('File saved: /tmp/用户文件.pdf')
})

it('serializes the display formatters with only their declared locale helpers',()=>{
 // Use the build script's native module loader; Vitest rewrites imported names
 // in function bodies, so its .toString() is not the source being injected.
 const output=execFileSync(process.execPath,['--input-type=module','-e',`import {NOTE_ENGLISH,noteUiText,noteUiError} from './packages/dsh-research-task-runtime/notes-locale.js';import{noteCapabilityReceiptMessage,capabilityReceiptText}from'./packages/dsh-research-task-runtime/client-capabilities.js';const render=new Function('const NOTE_ENGLISH='+JSON.stringify(NOTE_ENGLISH)+';'+noteUiText.toString()+';'+noteUiError.toString()+';'+noteCapabilityReceiptMessage.toString()+';'+capabilityReceiptText.toString()+';return capabilityReceiptText;')();process.stdout.write(render([{capability:'notes.export',status:'pending',message:'保存对话框已取消。'}],'en'))`],{encoding:'utf8'})
 expect(output).toBe('Export note: Waiting for user action. The save dialog was cancelled.')
})
