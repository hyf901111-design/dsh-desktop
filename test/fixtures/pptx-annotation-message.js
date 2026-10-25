export const annotationMessageSession='annotation-sent-session'
export const annotationMessageRpc='annotation-native-rpc'
export const annotationMessagePrepared='11111111-2222-4333-8444-555555555555'
export function annotationMessageFixture(){
 const references=[1,2].map(n=>({version:1,sessionId:annotationMessageSession,documentId:'b'.repeat(64),fileVersion:'a'.repeat(64),markId:'mark-'+n}))
 const block=(n,page)=>`[PPT 标注 ${n} · 第 ${page} 页]\n修改清单：\`.ework/pptx-annotations/${annotationMessagePrepared}/manifest.json\`\n输入副本：\`.ework/pptx-annotations/${annotationMessagePrepared}/1-source.pptx\`\n必须另存到：\`PPT标注修改/${annotationMessagePrepared}/1-内部研读-修改版.pptx\`\n按清单里的物理页、位置和备注完成真实 PPT 修改；保留原件。`
 const blocks=[block(1,1),block(2,3)],comments=['将封面副标题改为“内部研读 📈”，保留主标题与品牌版式。','将第三页左侧小标题改为“阅读定位”，保留正文。'],overall='全局要求：只调整这两处文字，保留全部页面与图表，原文件保持不变。',skill='/ework-skill-180a6a3f86f8942e'
 const text=blocks[0]+'\n'+comments[0]+'\n\n\n'+blocks[1]+'\n'+comments[1]+'\n\n\n'+overall+skill
 const proof={preparedId:annotationMessagePrepared,submissionId:annotationMessageRpc,userSeq:9,text,spans:blocks.map((value,index)=>({kind:'pptx-annotation',start:text.indexOf(value),end:text.indexOf(value)+value.length,text:value,reference:references[index],ordinal:index+1,label:'第'+[1,3][index]+'页 · 标题',comment:comments[index]})),skill:{start:text.length-skill.length,end:text.length,text:skill,id:'builtin:efund-ppt-maker',label:'/efund-ppt-maker'}}
 return{sessionId:annotationMessageSession,rpcId:annotationMessageRpc,text,comments,overall,skill,proof}
}
