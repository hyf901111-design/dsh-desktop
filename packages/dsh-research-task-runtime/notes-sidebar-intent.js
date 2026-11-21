/** Delivery evidence from this request only. This never grants tool authority,
 * infers instructions from note/history, or changes the Space insertion path.
 * Unknown writing requests keep the existing content fallback. */
export function sidebarNoteConversationOnly(input){
 if(input.entryPoint==='inline'||input.mode==='component'||typeof input.prompt!=='string')return false
 const prompt=input.prompt.trim()
 // Question/sequence boundaries end the previous request's scope. Preserve
 // “explain how to modify and update…” as one inquiry, but recognize an
 // independently directed delivery after it instead of swallowing that action.
 const clauses=prompt.split(/[，,。；;？！?!\n]/u).flatMap(sentence=>{
  const parts=sentence.split(/((?<!合)并(?:且)?|然后|之后|接着|同时|\s+and\s+|\s+then\s+)/iu),result=[]
  let current=parts[0]
  for(let index=1;index<parts.length;index+=2){
   const next=parts[index+1]?.trim()||'',questionComplement=/(?:如何|怎么|怎样|\b(?:how|what|why)\b)/iu.test(current)
   const newRequest=/^(?:请|帮我|麻烦|please\b)/iu.test(next)
   if(!questionComplement||newRequest){result.push(current);current=next}else current+=parts[index]+next
  }
  result.push(current);return result
 }).map(value=>value.trim()).filter(Boolean)
 const questionStart=/^(?:(?:请|帮我|麻烦|先|只(?:需|要|用)?|仅(?:需|要|用)?)\s*)*(?:解释|解读|说明|讨论|回答|答复|为什么|为何|如何|怎么|是否|能否|可否|what\b|why\b|how\b|explain\b|describe\b|answer\b|discuss\b)/iu
 const negatedAction=/^(?:(?:请|先|也|都|本次|此次|但是|但|不过|且)\s*)*(?:不(?:要|必|用|需)?|无需|别|do\s+not\b|don't\b|without\b)\s*(?:再|直接)?\s*(?:修改|改|编辑|更新|写|插入|添加|追加|删除|移除|移动|生成|创建|制作|绘制|重绘|edit\b|change\b|modify\b|write\b|insert\b|append\b|delete\b|create\b|generate\b|produce\b|draw\b)/iu
 // A real writing/edit clause wins over scoped negatives such as “不要改其他
 // 段落”. A question *about* these verbs is still a question, not an edit.
 const documentAction=/(?:插入|追加|添加|增加|新增|补充|写入|撰写|续写|改写|润色|创作|生成|创建|制作|绘制|重绘|修改|改成|改为|调整|替换|删除|移除|移动|排序|重排|(?:写|加|补)[一两几段篇点个份]|画[一张幅个]|(?:写|放|加|补)(?:到|在|入|至)(?:笔记|正文|文档|文末|末尾)|(?:给我|给出|提供|展示|先).{0,16}(?:正文|内容)?预览|\b(?:write|rewrite|revise|append|insert|add|create|generate|replace|remove|delete|move)\b)/iu
 if(clauses.some(clause=>{
  if(negatedAction.test(clause))return false
  // “解释这段代码” is an inquiry; “解释部分改成…” names the
  // document subject of a following edit predicate. Do not discard that edit.
  const sectionSubject=/^(?:(?:请|帮我|麻烦|先|只(?:需|要|用)?|仅(?:需|要|用)?)\s*)*(?:解释|说明)(?:部分|段落|内容|文字|章节|中|里)/u.test(clause)
  // Polite requests still authorize delivery; a question about how to do it
  // remains read-only. Do not turn “能否帮我写…” into a capability inquiry.
  const polite=/^(?:(?:请|麻烦)\s*)*(?:能否|可否|能不能|可不可以|是否可以)\s*(?:(?:帮我|为我|给我|麻烦你|你|请)\s*)*(.*)$/iu.exec(clause)
  if(polite&&!negatedAction.test(polite[1])&&!questionStart.test(polite[1])&&!/^(?:总结|概括|分析|判断|评估|比较|核对)/u.test(polite[1])){
   const action=documentAction.exec(polite[1]),question=/(?:为什么|为何|如何|怎么|什么)/u.exec(polite[1])
   if(action&&(!question||action.index<question.index))return true
  }
  if(questionStart.test(clause)&&!sectionSubject)return false
  const action=documentAction.exec(clause),question=/(?:为什么|为何|如何|怎么|什么)/u.exec(clause)
  return !!action&&(!question||action.index<question.index)
 }))return false
 return /[？?]|(?:为什么|为何|如何|怎么|什么|是否|能否|可否)|(?:只|仅)(?:需|要|用)?(?:回答|答复|解释|讨论)|(?:不(?:要|必|用|需)?|无需|别)(?:修改|改(?:动|写)?|编辑|更新|写入)(?:当前|这篇|这份)?(?:笔记|正文|文档)|\b(?:what|why|how|explain|describe|answer|discuss)\b/iu.test(prompt)||/^(?:(?:请|帮我|麻烦|先|只(?:需|要|用)?|仅(?:需|要|用)?)\s*)*(?:总结|概括|解释|解读|说明|讨论|核对|分析|评估|判断|比较)/u.test(prompt)
}


// A single explicitly supplied percentage suffices to answer a basis-point
// conversion. An actual reference or request to verify the note keeps its scope.
export function standaloneNoteBasisPoints(input,references){
 if(references.scope==='selection'||references.components.length||input.selection.trim()||
    input.images?.length||input.clientReceipts?.length)return false
 const instruction=input.prompt.normalize('NFKC').replace(/(?:不(?:要|用|必|需(?:要)?)?|无需|别)\s*(?:修改|编辑|改动|改写|写入|更新|改)\s*(?:当前|这篇|这份)?(?:的)?(?:笔记|正文|文档)|(?:do not|don't) (?:edit|change|modify) (?:this |the )?note/giu,'')
 if(/(?:当前|这篇|该|我的|本篇|从|参考|结合|根据|对照|按照)笔记|笔记(?:原文|中|里|内|上|的|《|提到|所述|记载)|正文|选区|上文|前文|前面|刚才|之前|对照|核对|核查|验证|比较|对比|另(?:外|一)|顺便|再帮我|然后|总结|附件|来源|查找|是否正确|\b(?:note|previous|compare|verify|in the document|attachment|source)\b/iu.test(instruction))return false
 const rates=instruction.match(/[+−-]?\d+(?:\.\d+)?\s*%/gu)
 return rates?.length===1&&/(?:等于|相当于|折合|折算|转换|换算|是|有).{0,18}(?:基点|bps?\b)|(?:几个?|多少)(?:个)?(?:基点|bps?\b)|\b(?:how many (?:bps?|basis points?)|(?:convert|express).{0,50}(?:in|to) (?:bps?|basis points?))\b/iu.test(instruction)
}
