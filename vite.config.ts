import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Vorcelab/app/',
  resolve: {
    alias: { '@': '/src' },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-zustand': ['zustand'],
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
  },
})
