/** A whole, unambiguous empty structure instruction only. Other prose stays on
 * the normal planning path; dimensions never erase a filling/data requirement. */
export function nativeBlankTableIntent(prompt:string,images:readonly unknown[]=[]):{rows:number;columns:number}|undefined{
 if(images.length)return
 const text=prompt.trim(),match=text.match(/^(?:请(?:你|帮我)?|帮我|麻烦(?:你)?(?:帮我)?)?\s*(?:创建|新建|生成|添加|插入|做)(?:一[个张])?\s*(?:(?:原生|可编辑|空白|空)(?:的)?\s*)*(\d+)\s*(?:乘(?:以)?|[×xX*])\s*(\d+)\s*(?:的)?\s*(?:(?:原生|可编辑|空白|空)(?:的)?\s*)*表格\s*(?:吧|(?:[,，]\s*)?谢谢)?[。.!！]?$/u)
 const rows=Number(match?.[1]),columns=Number(match?.[2])
 // Bound allocation by the existing document byte budget, not an artificial
 // smaller table dimension. Exact complete-note capacity is checked on apply.
 if(!match||!Number.isSafeInteger(rows)||!Number.isSafeInteger(columns)||rows<1||columns<1||rows*columns>Math.floor(4*1024*1024/3))return
 return{rows,columns}
}
