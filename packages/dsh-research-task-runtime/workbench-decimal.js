export function decimalParts(value){
 const [,sign,integer,fraction='',exponent='0']=/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(String(value));
 return {coefficient:BigInt(sign+integer+fraction),scale:fraction.length-Number(exponent)};
}

export function addDecimal(left,right){
 if(left===null)return right;
 const scale=Math.max(left.scale,right.scale);
 const scaled=value=>value.coefficient*10n**BigInt(scale-value.scale);
 return {coefficient:scaled(left)+scaled(right),scale};
}

export function decimalNumber({coefficient,scale}){
 return Number(`${coefficient}e${-scale}`);
}

export function subtractDecimal(left,right){
 const b=decimalParts(right);
 return decimalNumber(addDecimal(decimalParts(left),{...b,coefficient:-b.coefficient}));
}

export function decimalPercentage(left,right,digits=2){
 if(left===null||right===null||right===0)return null;
 const numerator=decimalParts(left),denominator=decimalParts(right);
 const power=denominator.scale-numerator.scale+digits+2;
 const a=numerator.coefficient*10n**BigInt(Math.max(0,power));
 const b=denominator.coefficient*10n**BigInt(Math.max(0,-power));
 const magnitude=value=>value<0n?-value:value;
 const x=magnitude(a),y=magnitude(b);
 const rounded=x/y+(x%y*2n>=y?1n:0n);
 return decimalNumber({coefficient:(a<0n)!==(b<0n)?-rounded:rounded,scale:digits});
}
