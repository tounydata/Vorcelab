import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // SW scope = base path (GitHub Pages subdir)
      scope: '/',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // MapLibre (~1 Mo) : hors précache → chargé à la 1ʳᵉ ouverture d'une carte 3D,
        // puis mis en cache runtime. Garde l'install PWA légère.
        globIgnores: ['**/maplibre-gl-*.js'],
        // HashRouter : toute navigation revient sur index.html
        navigateFallback: '/index.html',
        // Ne pas mettre en cache les appels Supabase auth (sécurité)
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Bundle MapLibre (lazy) — CacheFirst une fois téléchargé
            urlPattern: /\/assets\/maplibre-gl-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maplibre-lib',
              expiration: { maxEntries: 3, maxAgeSeconds: 2592000 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Tuiles MapTiler (carte 3D relief) — CacheFirst, 7 jours
            urlPattern: /^https:\/\/api\.maptiler\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maptiler-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Données Supabase — NetworkFirst, fallback cache 24h
            urlPattern: /^https:\/\/[a-z]+\.supabase\.co\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Tuiles CartoCDN (carte Leaflet) — CacheFirst, 7 jours
            urlPattern: /^https:\/\/[a-z]\.basemaps\.cartocdn\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Vorcelab',
        short_name: 'Vorcelab',
        description: 'Coaching trail running — stratégie, charge, renforcement',
        theme_color: '#ff4500',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          // PNG d'abord : iOS et les install prompts ignorent les SVG
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  base: '/',
  resolve: { alias: { '@': '/src' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-zustand': ['zustand'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.{js,ts}'] },
})
