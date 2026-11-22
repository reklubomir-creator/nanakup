import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { initializeApp } from 'firebase/app'
import { getMessaging } from 'firebase/messaging/sw'
import { firebaseConfig } from './firebase-config'
import { pushConfigured } from './push-config'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/nanakup/index.html'), {
  allowlist: [/^\/nanakup\/(?:\?|$)/]
}))

if (pushConfigured) {
  const app = initializeApp(firebaseConfig)
  // Register the SDK's push handlers during service worker startup.
  getMessaging(app)
}
