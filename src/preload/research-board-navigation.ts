// Track which sidebar entry opened the current session without duplicating its data.
const eventName = 'sherlock-sidebar-selection'
export function selectedBoardSession() {
  return document.documentElement.dataset.srbSelectedSession ?? ''
}
export function selectBoardSession(sessionId: string) {
  document.documentElement.dataset.srbSelectedSession = sessionId
  document.dispatchEvent(new Event(eventName))
}
export function subscribeBoardSelection(listener: () => void) {
  document.addEventListener(eventName, listener)
  return () => document.removeEventListener(eventName, listener)
}
