export function updateAppBadge(count) {
  if (typeof navigator.setAppBadge !== 'function') return Promise.resolve()
  return Promise.resolve(
    count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()
  ).catch(() => {})
}
