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
        // BrowserRouter (SPA) : toute navigation revient sur index.html
        navigateFallback: '/index.html',
        // Purge automatique des anciennes versions de précache à chaque déploiement.
        cleanupOutdatedCaches: true,
        // SÉCURITÉ : on ne met JAMAIS en cache les réponses de l'API Supabase
        // (Auth, REST, GraphQL, Storage, Functions). Ce sont des réponses
        // authentifiées propres à l'utilisateur connecté ; les mettre en cache
        // exposerait les données d'un compte à un autre sur le même appareil et
        // servirait des données périmées hors ligne. Aucune règle runtimeCaching
        // ne cible *.supabase.co : ces requêtes vont toujours au réseau.
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
    // Budget de bundle explicite (audit 22/07) : le seul chunk > 500 Ko est
    // maplibre-gl (~1,03 Mo min, ~273 Ko gzip) — déjà lazy (import() dans
    // RouteMap3D), hors précache PWA et mis en cache runtime. Budget accepté :
    // 1,1 Mo ; toute nouvelle dérive au-delà refait apparaître l'avertissement.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Forme fonction (robuste aux versions de types Rollup/Vite) — même
        // regroupement des vendors que la forme objet.
        manualChunks(id: string) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('node_modules/@tanstack/react-query')) return 'vendor-query'
          if (id.includes('node_modules/@supabase/supabase-js')) return 'vendor-supabase'
          if (id.includes('node_modules/zustand')) return 'vendor-zustand'
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.{js,ts}'] },
})
