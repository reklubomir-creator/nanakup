export const vapidKey = import.meta.env.VITE_PUSH_VAPID_KEY?.trim() ?? ''
export const pushConfigured = Boolean(vapidKey)
