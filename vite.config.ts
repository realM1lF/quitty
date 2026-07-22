import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    inspectAttr(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-mark.svg', 'empty-state.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'QuittyPro — Paulas Quittungsbuch',
        short_name: 'QuittyPro',
        description: 'Paulas persönliches Quittungsbuch: Quittungen eintragen, Fahrten berechnen, fertig für den Steuerberater.',
        lang: 'de',
        theme_color: '#1E5B43',
        background_color: '#F7F4EA',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-Shell + Fonts cachen; OSM/OSRM/Nominatim & Supabase niemals cachen
        navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
