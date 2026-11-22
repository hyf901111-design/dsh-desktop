// Old and web clients can omit the desktop's opaque account slot.
export function officeSessionOwner(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? {officeOwner:value} : {}
}
