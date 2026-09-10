import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      includeAssets: ['favicon.svg'],

      workbox: {
        // Activate new deployments immediately
        skipWaiting: true,
        clientsClaim: true,

        // Keep PDF renderer out of the install bundle
        globIgnores: ['**/pdf.worker-*.mjs', '**/pdfRender-*.js'],

        runtimeCaching: [
          {
            urlPattern: /.*(pdf\.worker-.*\.mjs|pdfRender-.*\.js)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-renderer',
              expiration: { maxEntries: 4 }
            }
          }
        ]
      },

      manifest: {
        name: 'FieldTrace',
        short_name: 'FieldTrace',
        description: 'Zone & asset field tracking for fit-out operations',
        theme_color: '#12181F',
        background_color: '#F7F7F5',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],

  server: {
    host: true,
    port: 5173
  }
})