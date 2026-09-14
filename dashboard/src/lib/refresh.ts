export const REFRESH_EVENT = "franel:refresh"

export function requestRefresh(): void {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function onRefresh(handler: () => void): () => void {
  window.addEventListener(REFRESH_EVENT, handler)
  return () => window.removeEventListener(REFRESH_EVENT, handler)
}