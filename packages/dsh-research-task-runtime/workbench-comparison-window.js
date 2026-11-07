// Resolve an unambiguous human calendar-month comparison once for all panels.
// Explicit dates, several horizons, non-market tasks and simulations keep their
// original scope; no source availability or trading calendar is inferred here.
export function workbenchComparisonWindow(input,now=new Date()) {
 const request=String(input.originalRequest??'').replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」/gu,'')
 if(input.dataMode==='simulated'||!/A股|股票|指数|沪深|中证|创业板|ETF/iu.test(request)||/\d{4}[-年/]\d|\d{1,2}月\d{1,2}[日号]|交易日|自然日/u.test(request))return
 const horizons=[...request.matchAll(/(?:最近|过去|近)\s*([一二三四五六七八九十两\d]+)\s*(?:个)?月/gu)]
 if(horizons.length!==1)return
 const number={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10}
 const months=number[horizons[0][1]]??Number(horizons[0][1])
 if(!Number.isInteger(months)||months<1||months>12)return
 const rest=request.replace(horizons[0][0],'')
 if(/今年|本周|本月|本季度|去年|(?:最近|过去|近)\s*(?:[一二三四五六七八九十两\d]+\s*(?:个)?\s*)?(?:天|日|周|月|年|季)/u.test(rest))return
 const end=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
 const [year,month,day]=end.split('-').map(Number),base=new Date(Date.UTC(year,month-1-months,1))
 const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate()
 base.setUTCDate(Math.min(day,last))
 return {start:base.toISOString().slice(0,10),end}
}
export function comparisonWindowInstruction(input,now) {
 const range=workbenchComparisonWindow(input,now)
 return range?'\n【本次比较的共同日期窗口】'+range.start+' 至 '+range.end+'（北京时间、自然月）。走势、区间涨跌幅、最高最低和概览表统一使用此窗口内的实际交易记录；区间起点取窗口内首个有记录的交易日，终点取窗口内最后一个，不把固定65根当作三个月，也不引用窗口外的基期。先取足够历史，再用真实日期字段筛选；标签、曲线和派生统计采用同一筛选与升序排序。来源缺日不补值，不假称已覆盖；显示实际首末日期和观测数量，不能编写与记录矛盾的日期说明。':''
}
