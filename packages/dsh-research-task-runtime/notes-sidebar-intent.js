/** Delivery evidence from this request only. This never grants tool authority,
 * infers instructions from note/history, or changes the Space insertion path.
 * Unknown writing requests keep the existing content fallback. */
export function sidebarNoteConversationOnly(input){
 if(input.entryPoint==='inline'||input.mode==='component'||typeof input.prompt!=='string')return false
 const prompt=input.prompt.trim(),clauses=prompt.split(/[，,。；;\n]/u).map(value=>value.trim()).filter(Boolean)
 const questionStart=/^(?:(?:请|帮我|麻烦|先)\s*)*(?:解释|解读|说明|讨论|回答|答复|为什么|为何|如何|怎么|是否|能否|可否|what\b|why\b|how\b|explain\b|describe\b|answer\b|discuss\b)/iu
 const negatedAction=/^(?:(?:请|先|也|都|本次|此次)\s*)*(?:不(?:要|必|用|需)?|无需|别|do\s+not\b|don't\b|without\b)\s*(?:再|直接)?\s*(?:修改|改|编辑|更新|写|插入|添加|追加|删除|移除|移动|edit\b|change\b|modify\b|write\b|insert\b|append\b|delete\b)/iu
 // A real writing/edit clause wins over scoped negatives such as “不要改其他
 // 段落”. A question *about* these verbs is still a question, not an edit.
 const documentAction=/(?:插入|追加|添加|增加|新增|补充|写入|撰写|续写|改写|润色|创作|生成|创建|制作|绘制|重绘|修改|改成|改为|调整|替换|删除|移除|移动|排序|重排|写[一两几段篇点个份]|画[一张幅个]|(?:写|放|加|补)(?:到|在|入|至)(?:笔记|正文|文档|文末|末尾)|(?:给我|给出|提供|展示|先).{0,16}(?:正文|内容)?预览|\b(?:write|rewrite|revise|append|insert|add|create|generate|replace|remove|delete|move)\b)/iu
 if(clauses.some(clause=>{
  if(negatedAction.test(clause))return false
  // “解释这段代码” is an inquiry; “解释部分改成…” names the
  // document subject of a following edit predicate. Do not discard that edit.
  const sectionSubject=/^(?:(?:请|帮我|麻烦|先)\s*)*(?:解释|说明)(?:部分|段落|内容|文字|章节|中|里)/u.test(clause)
  if(questionStart.test(clause)&&!sectionSubject)return false
  const action=documentAction.exec(clause),question=/(?:为什么|为何|如何|怎么|什么)/u.exec(clause)
  return !!action&&(!question||action.index<question.index)
 }))return false
 return /[？?]|(?:为什么|为何|如何|怎么|什么|是否|能否|可否)|(?:只|仅)(?:需|要|用)?(?:回答|答复|解释|讨论)|(?:不(?:要|必|用|需)?|无需|别)(?:修改|改(?:动|写)?|编辑|更新|写入)(?:当前|这篇|这份)?(?:笔记|正文|文档)|\b(?:what|why|how|explain|describe|answer|discuss)\b/iu.test(prompt)||/^(?:(?:请|帮我|麻烦|先)\s*)*(?:总结|概括|解释|解读|说明|讨论|核对|分析|评估|判断|比较)/u.test(prompt)
}
