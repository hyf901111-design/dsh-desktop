// A labeled creative brief can introduce a direct request. Keep ordinary prose,
// quoted instructions and aspect ratios in the original message intact.
export function imageBriefText(text) {
  return text.normalize('NFKC').trim()
    .replace(/^(?:[\p{L}\p{N} _-]{0,36}(?:执行|任务|需求|封面|海报|配图|brief|request|task)[\dA-Za-z_-]*)\s*:\s*/iu, '')
}

// Only direct image requests bind a turn to the canvas. Discussion stays in the native composer.
export function imageFactoryNeedsCanvas(text, targeted = false) {
  const clauses = imageBriefText(text).replace(/〔图层 [0-9]+[:：][^〕]*〕/gu, '').split(/[。！？!?；;，,\n]|然后|接着|\bthen\b/iu)
  const artwork = /图(?:片|像|标|形|画)?|照片|海报|插画|封面|配图|壁纸|背景|效果图|banner/iu
  const visualOutput = /\b(?:image|photo|picture|poster|illustration|banner|cover|icon|logo|background)s?\b/iu
  return clauses.some(clause => {
    const instruction = clause.trim().replace(/^按(?:照)?(?:刚才|刚刚|之前|上面|这个|这套|讨论好?的|刚讨论的).{0,32}?(?:方案|构图|配色|风格|建议)\s*(?=(?:现在|请|直接|开始|生成|绘制|出图))/u, '')
    const request = instruction.replace(/^(?:(?:请(?:你)?|麻烦(?:你)?|能否|能不能|可不可以|可以|我(?:想要?|需要|希望你|要)|帮我|给我|替我|现在|立即|直接|接下来|开始|继续|重新|先|再)\s*)+/u, '')
      .replace(/^(?:(?:please|(?:can|could|would) you|help me|let's|now|go ahead and)\s+)+/iu, '')
    const output = request.split(/(?:并且?|然后|\b(?:and|then)\b)/iu, 1)[0]
    if (/(?:提示词|文案|教程|方案|思路|建议|步骤|如何|怎么|怎样|需要多久|要多长时间|的(?:时间|费用|价格|限制|步骤|流程)|是什么原理)|\b(?:prompt|copy|tutorial|ideas?|suggestions?|instructions?|how to)\b/iu.test(output)) return false
    if (/^(?:生图|出图|去背景|抠图)/u.test(output)) return true
    if (/^(?:画|绘制)(?:出)?一(?:张|幅|个|只|条)/u.test(output) || /^draw\s/iu.test(output)) return true
    if (/^(?:生成|制作|创建|画|绘制|设计|做|弄|来|输出|修改|编辑|优化|调整|替换|重绘|重做|更换)/u.test(output) && artwork.test(output)) return true
    if (/^(?:把|将|给|为).*(?:换|改|调|移|删除|去掉|加上|替换|裁剪|重绘)/u.test(output) && (targeted || artwork.test(output))) return true
    if (targeted && /^(?:改|换|调|移|替换|缩放|放大|缩小|删除|去掉|加上|居中|对齐)/u.test(output)) return true
    return /^(?:generate|create|make|render|design|edit|retouch|recolor|crop|replace|remove)\s/iu.test(output) && (targeted || visualOutput.test(output))
  })
}

export function startsNewImage(prompt) {
  const text = imageBriefText(prompt).replace(/^(?:(?:现在|立即|直接|开始|请你|请|帮我)\s*)+/u, '')
  return /^(?:请(?:帮我)?|帮我)?\s*(?:(?:另|从头|从零)(?:生成|制作|设计|创建|做|画)\s*一[张幅]|(?:生成|制作|设计|创建|做|画)\s*一[张幅]\s*(?:全新的?|新的))/u.test(text) ||
    /^(?:please\s+)?(?:generate|create|make|draw|design)\s+a\s+(?:brand[- ]new|new)\s+(?:(?:square|landscape|portrait|\d+:\d+)\s+)?(?:image|poster|illustration|cover|graphic)\b/iu.test(text)
}
