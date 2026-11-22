import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/nanakup/',
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon-192.png','icon-512.png'],
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.js',
    manifest: {
      name: 'NaNákup', short_name: 'NaNákup', lang: 'cs', id: '/nanakup/',
      start_url: '/nanakup/', scope: '/nanakup/', display: 'standalone',
      theme_color: '#29234c', background_color: '#f7f4ef',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    }
  })]
})
