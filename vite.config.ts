import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// ROP Connect — Vite config with React + PWA (installable on phone & desktop).
// Base path is '/' for local dev + Netlify (root domain); set DEPLOY_BASE
// (e.g. '/rop-conciergephone/') when building for a GitHub Pages project site.
export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we register + poll for updates manually in main.tsx
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'offline.html'],
      workbox: {
        // Take over as soon as a new build installs, and control open pages immediately. Without
        // these, the generated SW only skip-waited on an explicit message that nothing sent, so
        // every new version installed and then sat waiting forever — the app never updated itself
        // and the Refresh button couldn't activate it. With these, a new build activates on its own
        // and the page reloads onto it automatically.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Layer our Web Push handlers onto the generated Workbox SW (push + notificationclick).
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /supabase/],
        runtimeCaching: [
          {
            // Cache Supabase Storage assets (avatars, uploaded images) for offline-friendly reads.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rop-storage-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'ROP Chat',
        short_name: 'ROP Chat',
        description: 'Private team communication for Robert of Philadelphia Salons',
        theme_color: '#1f2a44',
        background_color: '#0f1420',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // Web Share Target (Android): makes ROP Chat appear in the phone's share sheet so photos/
        // videos can be shared straight into the app. The OS POSTs the files to /share-target, which
        // our service worker (push-sw.js) catches and hands to the in-app "Share to ROP Chat" screen.
        // (iOS/Safari does not support share targets for installed web apps — Android only.)
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['image/*', 'video/*'] }],
          },
        },
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          vendor: ['zustand', 'date-fns'],
        },
      },
    },
  },
  server: { port: 5173 },
})
