import {createHash} from 'node:crypto'
import {isDate} from './schema.mjs'

const TYPES=new Set(['公司研究报告','财报点评报告','公司研究简报'])
const forbidden=/[<>:"/\\|?*\p{Cc}\p{Cf}\u2028\u2029]/gu
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const invalid=field=>{throw Error(`${field} 无效；请使用有界纯文本和受支持的报告类别。`)}
function text(value,field,maximum,{plain=false}={}){
 if(typeof value!=='string'||!value.trim()||Array.from(value).length>maximum||/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(value)||plain&&/[<>]/u.test(value))invalid(field)
 return value.normalize('NFC').trim().replace(/\s+/gu,' ')
}
function shorten(value,limit){
 if(Buffer.byteLength(value)<=limit)return value
 const tail='_'+createHash('sha256').update(value).digest('hex').slice(0,10)
 let prefix=''
 for(const point of value){if(Buffer.byteLength(prefix+point+tail)>limit)break;prefix+=point}
 return prefix+tail
}
const component=value=>value.normalize('NFC').replace(forbidden,'_').replace(/\s+/gu,' ').replace(/^[. ]+|[. ]+$/g,'')||'未填写'

/** Publication labels and portable basenames only; no caller-supplied file paths. */
export function publicationMetadata(packet){
 const publication=packet?.report?.publication
 if(publication!==undefined&&(!object(publication)||Object.keys(publication).some(key=>!['companyShortName','reportType','industry'].includes(key))))invalid('report.publication')
 const companyLabel=publication?.companyShortName===undefined?text(packet?.company?.name,'company.name',2048):text(publication.companyShortName,'report.publication.companyShortName',80,{plain:true})
 const ticker=text(packet?.company?.ticker,'company.ticker',512)
 if(publication?.industry!==undefined)text(publication.industry,'report.publication.industry',80,{plain:true})
 const reportType=publication?.reportType===undefined?(packet?.report?.profile==='full'?'公司研究报告':'公司研究简报'):publication.reportType
 if(!TYPES.has(reportType))invalid('report.publication.reportType')
 if(!isDate(packet?.financialAsOf))invalid('financialAsOf')
 if(!isDate(packet?.asOf))invalid('asOf')
 const year=packet.financialAsOf.slice(0,4),monthDay=packet.financialAsOf.slice(5)
 const financialPeriodLabel=({ '12-31':`${year}年报`,'06-30':`${year}中报`,'03-31':`${year}一季报`,'09-30':`${year}三季报` })[monthDay]??`截至${packet.financialAsOf}`
 const reportName=`${companyLabel}（${ticker}）${financialPeriodLabel}${reportType}`
 // Preserve date/category while shortening long identity components. A digest
 // distinguishes names that share the same retained prefix.
 const suffix=`（${shorten(component(ticker),56)}）${financialPeriodLabel}${reportType}_${packet.asOf}`
 const fileStem=shorten(component(companyLabel),235-Buffer.byteLength(suffix))+suffix
 return{companyLabel,reportType,financialPeriodLabel,reportName,fileStem}
}
