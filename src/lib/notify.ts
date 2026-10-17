import type { Settings } from '../db/types'

/** Shows a system notification when enabled and the app is in the background. */
export async function notify(settings: Settings, title: string, body: string) {
  if (!settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return
  if (!document.hidden) return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, icon: '/pwa-192x192.png', tag: 'elvora-timer' })
      return
    }
  } catch {
    // fall through to the page-level notification
  }
  try {
    new Notification(title, { body, icon: '/pwa-192x192.png' })
  } catch {
    // notifications unsupported here
  }
}
