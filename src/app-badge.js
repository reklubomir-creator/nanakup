export async function updateAppBadge(count) {
  if (!Number.isSafeInteger(count) || count < 0) return
  try {
    if (count === 0) await navigator.clearAppBadge?.()
    else await navigator.setAppBadge?.(count)
  } catch {
    // Badging is optional and can be blocked by the browser or system.
  }
}
