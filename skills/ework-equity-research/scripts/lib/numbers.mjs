// Exact rational arithmetic. Financial inputs never pass through Number/parseFloat.
const DECIMAL = /^-?(?:0|[1-9]\d{0,1023})(?:\.\d{1,24})?$/
const gcd = (a, b) => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a || 1n }
export class Decimal {
  constructor(n, d = 1n) {
    if (!d) throw new Error('DIVISION_BY_ZERO')
    if (d < 0n) { n = -n; d = -d }
    const factor = gcd(n, d); this.n = n / factor; this.d = d / factor
  }
  static from(value) {
    if (value instanceof Decimal) return value
    if (typeof value !== 'string' || !DECIMAL.test(value)) throw new Error('Expected a decimal string (up to 1024 integer / 24 fractional digits)')
    const [integer, fraction = ''] = value.split('.')
    return new Decimal(BigInt(integer + fraction), 10n ** BigInt(fraction.length))
  }
  add(value) { const v = Decimal.from(value); return new Decimal(this.n * v.d + v.n * this.d, this.d * v.d) }
  sub(value) { const v = Decimal.from(value); return new Decimal(this.n * v.d - v.n * this.d, this.d * v.d) }
  mul(value) { const v = Decimal.from(value); return new Decimal(this.n * v.n, this.d * v.d) }
  div(value) { const v = Decimal.from(value); return new Decimal(this.n * v.d, this.d * v.n) }
  cmp(value) { const v = Decimal.from(value); const n = this.n * v.d - v.n * this.d; return n < 0n ? -1 : n > 0n ? 1 : 0 }
  pow(exponent) { return new Decimal(this.n ** BigInt(exponent), this.d ** BigInt(exponent)) }
  toString(places = 18, fixed = false) {
    if (!Number.isInteger(places) || places < 0 || places > 24) throw new Error('places must be an integer from 0 to 24')
    const scale = 10n ** BigInt(places); const absolute = this.n < 0n ? -this.n : this.n
    const rounded = (absolute * scale * 2n + this.d) / (this.d * 2n)
    const digits = rounded.toString().padStart(places + 1, '0')
    const whole = places ? digits.slice(0, -places) : digits
    const fraction = places ? digits.slice(-places) : ''
    const suffix = fixed ? fraction : fraction.replace(/0+$/, '')
    return `${this.n < 0n && rounded ? '-' : ''}${whole}${suffix ? '.' + suffix : ''}`
  }
}
export const decimal = value => Decimal.from(value)
// Presentation-only scaling, rounded half away from zero. No binary floats.
export function formatDecimal(value, { scale = '1', places = 2 } = {}) {
  return decimal(value).div(scale).toString(places, true)
}
export function displayDecimal(value) {
  if (typeof value !== 'string' || !/^(?:-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\(\d+(?:\.\d+)?\))$/.test(value)) throw new Error('Invalid source number token')
  return decimal(value.startsWith('(') ? '-' + value.slice(1, -1) : value.replaceAll(',', ''))
}
