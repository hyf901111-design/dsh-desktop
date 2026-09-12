// A revoked preview can finish navigating while its signed-out iframe unmounts.
// Only accept a denial that the fixture server independently recorded during
// the explicit account teardown; all other resource errors remain failures.
export function isExpectedAuthTeardownPreviewDenial(entry, origin, diagnostics) {
  const prefix = 'Failed to load resource: the server responded with a status of 403 (Forbidden) '
  if (!entry.startsWith(prefix)) return false
  try {
    const location = JSON.parse(entry.slice(prefix.length))
    const url = new URL(location.url)
    if (url.origin !== origin || url.pathname !== '/preview') return false
    return diagnostics.some(record =>
      record.kind === 'preview' && record.url === url.href &&
      record.status === 403 && record.reason === 'Preview capability denied.' &&
      ['peer-account-reactivation-signout', 'owner-account-isolation-signout'].includes(record.phase) &&
      record.completedPhase === record.phase &&
      record.before?.authenticated === false && record.before.current === null &&
      record.after?.authenticated === false && record.after.current === null
    )
  } catch { return false }
}
