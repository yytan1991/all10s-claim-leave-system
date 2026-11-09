// Text size. "compact" (the default) is one size smaller on larger screens, so more fits on one page.
// "comfortable" is the normal size. The choice is remembered on this device. Phones are never changed.
const KEY = 'wiiteam-density'

export function getDensity() {
  try {
    return localStorage.getItem(KEY) === 'comfortable' ? 'comfortable' : 'compact'
  } catch {
    return 'compact'
  }
}

export function applyDensity(value = getDensity()) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('density-compact', value === 'compact')
}

export function setDensity(value) {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* private mode: just apply it for this visit */
  }
  applyDensity(value)
}
