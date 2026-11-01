import {expect,it} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {sidebarNoteConversationOnly} from '../packages/dsh-research-task-runtime/notes-sidebar-intent.js'

it.each([
 '这段Python函数对空列表会返回什么？只回答，不修改笔记。',
 '如何修改并在笔记末尾添加示例？','How do I modify and append a paragraph to the note?', '解释如何修改并更新这段代码','如何修改并更新这段代码？','Explain how to modify and update this function.', '解释创建流程','解释一下这段函数，不修改笔记','说明中如何增加一段使用方法？','解释如何修改这段代码','为什么不能删除这段？','如何更新这张表？','这段函数应该怎么修改？',
 '总结全文','这段函数的空列表返回值，不改笔记','解释一下这段代码，不改笔记','请核对这段推导是否成立','只需回答，不要写入正文','Explain this function; do not modify the note.',
])('keeps the current conversational instruction out of document preview: %s',prompt=>{
 expect(sidebarNoteConversationOnly({entryPoint:'composer',mode:'write',prompt})).toBe(true)
})
it.each([
 '不要改其他段落，只在笔记末尾追加两句总结，先给我预览',
 '总结一下全文写在文末','总结全文并写到笔记末尾','解释部分改成更简洁的两句话','说明中增加一段使用方法',
 '不修改其它内容，在这段后插入一个表格',
 '解释这段代码，然后在笔记末尾添加一个代码示例',
 '在笔记末尾补一个两句总结，先给我预览','写一段文字','把所选段落改写为简洁文字','请写一段解释如何调用这个函数的说明','生成一段文字说明为什么会出现这个结果',
 '只修改所选组件，不要改其他段落','创建一个可交互图表','总结全文并追加到笔记末尾',
 'Write a short paragraph. Do not modify other paragraphs.',
])('retains real content/edit requests despite scoped negatives: %s',prompt=>{
 expect(sidebarNoteConversationOnly({entryPoint:'composer',mode:'write',prompt})).toBe(false)
})
it('uses neither historical instructions nor note text as current delivery intent and leaves Space unchanged',()=>{
 const input={mode:'write',prompt:'写一段文字',markdown:'只回答，不修改笔记。',selection:'解释这里',conversation:[{prompt:'只回答'}]}
 expect(sidebarNoteConversationOnly({...input,entryPoint:'composer'})).toBe(false)
 expect(sidebarNoteConversationOnly({...input,prompt:'只回答，不修改笔记。',entryPoint:'inline'})).toBe(false)
})

it.each(['plain','typed'])('emits no document-writing progress for a readonly %s answer, even when the model tags it text',async mode=>{
 const seen=[],answer='空列表返回 None。',output=mode==='plain'?answer:JSON.stringify({kind:'text',markdown:answer})
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'fixture',model:'readonly'},routable:true}}})}},llm:{stream:async function*(){yield{type:'text-delta',text:output};yield{type:'finish',reason:{kind:'stop'}}}}}
 const result=await generateNoteSuggestion(ctx,{sessionId:'one',requestId:'readonly',entryPoint:'composer',mode:'write',prompt:'这段函数返回什么？只回答，不修改笔记。',title:'',markdown:'',selection:''},undefined,value=>seen.push(value))
 expect(result).toMatchObject({kind:'conversation',markdown:answer});expect(seen.every(value=>value.documentIntent!==true)).toBe(true)
})

it.each([
 '请解释这段代码并在笔记末尾添加一个代码示例',
 '这段函数应该怎么修改？请把选中段落改写为完整说明',
 'Explain this function and append a short example to the note.',
 '请先解释这张图并给我正文预览',
])('recognizes a final writing instruction after an initial explanation: %s',prompt=>{
 expect(sidebarNoteConversationOnly({entryPoint:'composer',mode:'write',prompt})).toBe(false)
})

it.each([
 '解释如何修改并在笔记末尾添加示例？',
 'Explain how to modify and append a paragraph to the note.',
])('keeps a how-to complement scoped across a note-location continuation: %s',prompt=>{
 expect(sidebarNoteConversationOnly({entryPoint:'composer',mode:'write',prompt})).toBe(true)
})
it.each([
 '解释如何修改，并请在笔记末尾添加示例',
 'Explain how to modify and please append a paragraph to the note.',
])('allows an independently polite writing request after a how-to explanation: %s',prompt=>{
 expect(sidebarNoteConversationOnly({entryPoint:'composer',mode:'write',prompt})).toBe(false)
})
