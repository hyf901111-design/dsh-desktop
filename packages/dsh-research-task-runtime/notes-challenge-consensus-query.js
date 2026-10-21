const metrics = ['EPS', 'NET_PROFIT', 'MAIN_BUS_INC']
const fields = ['S_INFO_WINDCODE', 'EST_REPORT_DT', 'EST_DT', 'CONSEN_DATA_CYCLE_TYP', 'NUM_EST_INST', 'S_EST_BASESHARE',
  ...metrics.flatMap(metric => ['AVG', 'MEDIAN', 'MIN', 'MAX', 'DEV'].map(suffix => `${metric}_${suffix}`)),
  ...['NET_PROFIT', 'MAIN_BUS_INC'].flatMap(metric => ['UPGRADE', 'DOWNGRADE', 'MAINTAIN'].map(suffix => `${metric}_${suffix}`))]

export function consensusDate(value) {
  const text = String(value ?? '').replaceAll('-', '').replaceAll('/', '')
  if (!/^20\d{6}$/.test(text)) return null
  const iso = `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}`
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10) === iso ? text : null
}

/** Only host-built queries reach either source. No renderer/model SQL or object names. */
export function consensusSql(claim, mode) {
  if (!/^\d{6}\.(?:SH|SZ|BJ)$/.test(claim.windCode) || !Number.isInteger(claim.year) || claim.year < 2000 || claim.year > 2099 || !consensusDate(claim.baseDate) || !['historical','latest','coverage'].includes(mode)) throw Error('一致预期查询参数无效。')
  const table = 'TYDW_FILESYNC.ASHARECONSENSUSDATA', code = `S_INFO_WINDCODE = '${claim.windCode}'`
  if (mode === 'coverage') return `SELECT MIN(EST_REPORT_DT) AS FIRST_PERIOD, MAX(EST_REPORT_DT) AS LAST_PERIOD FROM ${table} WHERE ${code}`
  const where = `${code} AND EST_REPORT_DT = '${claim.year}1231'`
  return `SELECT ${fields.join(', ')} FROM ${table} WHERE ${where} AND EST_DT = (SELECT MAX(EST_DT) FROM ${table} WHERE ${where}${mode === 'historical' ? ` AND EST_DT <= '${consensusDate(claim.baseDate)}'` : ''})`
}
