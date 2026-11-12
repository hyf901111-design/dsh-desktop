export const prototypeReadCapability=Symbol.for('ework.builtin-prototype.read');
const activeReads=new Map();

export async function withWorkbenchPrototypeRead(callId,agent,token,args,invoke){
 activeReads.set(callId,{agent,token,args});
 try{return await invoke()}finally{activeReads.delete(callId)}
}

export function isWorkbenchPrototypeTableRead(exec){
 const read=activeReads.get(exec.callId);
 return Boolean(read&&exec.name==='read_prototype'&&exec.agent===read.agent&&exec.parent===read.token&&
  exec.arguments?.file_path===read.args.file_path&&exec.arguments?.section===read.args.section&&exec.arguments?.offset===read.args.offset);
}
