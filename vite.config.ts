import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // SW scope = base path (GitHub Pages subdir)
      scope: '/Vorcelab/app/',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // HashRouter : toute navigation revient sur index.html
        navigateFallback: '/Vorcelab/app/index.html',
        // Ne pas mettre en cache les appels Supabase auth (sécurité)
        navigateFallbackDenylist: [/^\/Vorcelab\/app\/api/],
        runtimeCaching: [
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
        scope: '/Vorcelab/app/',
        start_url: '/Vorcelab/app/',
        icons: [
          {
            src: '/Vorcelab/app/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  base: '/Vorcelab/app/',
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
