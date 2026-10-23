import {Decimal,decimal} from './numbers.mjs'
import {isDate} from './schema.mjs'

// Fixed-point transcendental arithmetic with 72 working decimal digits.
// No financial amount or rate passes through binary floating point. For
// 0<=rate<1 and 0<=days<=36500, 24-place outputs are checked against independent
// 90-digit Decimal vectors. Ordinary model arithmetic remains exact rational.
const SCALE=10n**72n
const mul=(a,b)=>a*b/SCALE
const div=(a,b)=>a*SCALE/b
function logPositive(x){
 const z=div(x-SCALE,x+SCALE),z2=mul(z,z)
 let power=z,total=z
 for(let i=3n;i<=2001n;i+=2n){power=mul(power,z2);const term=power/i;if(!term)return 2n*total;total+=term}
 throw Error('DISCOUNT_CONVERGENCE:对数计算未收敛')
}
function expPositive(x){
 let halves=0
 while(x>SCALE/2n){x/=2n;halves++}
 let term=SCALE,total=SCALE
 for(let i=1n;i<=1000n;i++){
  term=mul(term,x)/i
  if(!term){for(let j=0;j<halves;j++)total=mul(total,total);return total}
  total+=term
 }
 throw Error('DISCOUNT_CONVERGENCE:指数计算未收敛')
}

export function actualDays(start,end){
 if(!isDate(start)||!isDate(end))throw Error('DISCOUNT_DATE:折现日期必须是真实ISO日期')
 const days=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000
 if(!Number.isSafeInteger(days)||days<0||days>36500)throw Error('DISCOUNT_DATE:现金流日须不早于估值日，且期限不超过百年')
 return days
}

export function discountActual365(rate,days){
 const r=decimal(rate)
 if(r.cmp('0')<0||r.cmp('1')>=0||!Number.isSafeInteger(days)||days<0||days>36500)throw Error('DISCOUNT_INPUT:需要0<=折现率<1及非负、有限的实际天数')
 if(!days||r.cmp('0')===0)return decimal('1')
 const base=SCALE+r.n*SCALE/r.d
 const power=logPositive(base)*BigInt(days)/365n
 return new Decimal(SCALE*SCALE/expPositive(power),SCALE)
}
