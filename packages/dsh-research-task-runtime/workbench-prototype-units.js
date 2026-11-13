const amountUnit = '(?:亿|百万|万|千)?(?:港元|美元|元|人民币)';
const unitInLabel = new RegExp('\\s*[（(](?:'+amountUnit+'|亿|万|%|％|比例)[）)]$', 'u');
const amountDeclaration = new RegExp('金额\\s*(?:以|单位\\s*[:：为]?)\\s*('+amountUnit+')(?:计|[，。；,.;\\s]|$)', 'u');

export function prototypeMonetaryUnit(index, section, field, label, presentation) {
 const monetaryLabel = /金额|规模|净流入|净流出|资金流|成交额|市值|余额|成本/u.test(label ?? '') &&
   !/(?:比率|比例|占比|收益率|变化率|增长率)/u.test(label ?? '');
 const indexProduct = /^DYN\.(?:prods|ours|groups\.by_(?:category|geo))$/u.test(section);
 const indexAmount = indexProduct && /^(?:(?:scale|flow(?:_\w+)?|chg)$|amt\.)/u.test(field);
 const reconciliationAmount = section === 'PROV.recon_rows' && ['cc','sv','bs'].includes(field);
 const declared = new Set((index?.unitDeclarations ?? []).map(text => amountDeclaration.exec(text)?.[1]).filter(Boolean));
 if (declared.size === 1 && (monetaryLabel || indexAmount || reconciliationAmount)) return [...declared][0];

 // The original HK ETF prototype distinguishes the market amounts from the
 // amounts in the channel breakdown. Only original display labels establish either unit.
 const labels = presentation?.labels ?? [];
 if (indexProduct && field.startsWith('amt.') && labels.some(text => /渠道资金进出.{0,5}万港元/u.test(text))) return '万港元';
 if (indexAmount && !field.startsWith('amt.') && labels.some(text => /前十产品.{0,25}亿港元/u.test(text))) return '亿港元';
 if (indexProduct && section === 'DYN.ours' && ['scale','flow','chg'].includes(field) &&
     labels.some(text => /(?:净流入|规模)\(亿\)/u.test(text)) &&
     labels.some(text => /渠道资金进出.{0,5}万港元/u.test(text))) return '亿港元';
}

export function withPrototypeUnit(field, unit) {
 return unit === undefined ? field : {...field,label:field.label?.replace(unitInLabel,''),unit};
}
