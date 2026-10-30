/** Widths are layout CSS pixels, never zoomed screen coordinates. */
export function chooseNativeTableColumnWidths(columnCount:number,availableWidth:number,existingWidths?:readonly (number|undefined)[]):number[]{
 if(!Number.isSafeInteger(columnCount)||columnCount<1||columnCount>10000||!Number.isFinite(availableWidth)||availableWidth<=0)throw new RangeError('表格列数或可用宽度无效。')
 if(existingWidths?.length===columnCount&&existingWidths.every(width=>typeof width==='number'&&Number.isFinite(width)&&width>0))return existingWidths.slice() as number[]
 const total=Math.max(columnCount*35,Math.floor(availableWidth)),base=Math.floor(total/columnCount),remainder=total-base*columnCount
 return Array.from({length:columnCount},(_,index)=>base+(index<remainder?1:0))
}

/** Empty tables start compact; larger ones still fit the real note width. */
export function initialNativeTableColumnWidths(columnCount:number,availableWidth:number):number[]{
 return chooseNativeTableColumnWidths(columnCount,Math.min(availableWidth,columnCount*100))
}

/** Scale the whole table while keeping column proportions and the native 35px floor. */
export function resizeNativeTableColumnWidths(widths:readonly number[],requestedWidth:number):number[]{
 if(!widths.length||widths.some(width=>!Number.isFinite(width)||width<=0)||!Number.isFinite(requestedWidth)||requestedWidth<=0)throw new RangeError('表格宽度无效。')
 const total=Math.max(widths.length*35,Math.round(requestedWidth)),result=Array<number>(widths.length).fill(0),remaining=new Set(widths.map((_,i)=>i));let budget=total
 while(remaining.size){
  const weight=[...remaining].reduce((sum,index)=>sum+widths[index]!,0),small=[...remaining].filter(index=>budget*widths[index]!/weight<35)
  if(!small.length){
   const shares=[...remaining].map(index=>({index,value:budget*widths[index]!/weight}));let rest=budget
   for(const {index,value} of shares){result[index]=Math.floor(value);rest-=result[index]!}
   shares.sort((a,b)=>(b.value-Math.floor(b.value))-(a.value-Math.floor(a.value))||a.index-b.index)
   for(let i=0;i<rest;i++)result[shares[i]!.index]=result[shares[i]!.index]!+1
   break
  }
  for(const index of small){result[index]=35;budget-=35;remaining.delete(index)}
 }
 return result
}
