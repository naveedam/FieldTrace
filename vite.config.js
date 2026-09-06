import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        // pdfjs (~2.5MB combined) is dynamic-imported only when an admin
        // uploads a PDF floor plan — see src/pages/admin/FloorPlanImport.jsx.
        // Excluding it from precache keeps the PWA install lean for field
        // technicians, who never touch that code path. It's fetched and
        // runtime-cached the first time it's actually needed instead.
        globIgnores: ['**/pdf.worker-*.mjs', '**/pdfRender-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/(pdf\.worker-.*\.mjs|pdfRender-.*\.js)$/,
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
        description: 'Zone & asset field tracking for fitout operations',
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
});
