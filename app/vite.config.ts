import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // スマホのホーム画面に追加でき、オフラインでも開けるようにする
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'フレーズ暗記（韓国語）',
        short_name: 'フレーズ暗記',
        description: '好きな動画・ライブ・画像の韓国語から作る暗記カード',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#fafaf9',
        theme_color: '#e11d48',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  test: { environment: 'node' },
} as never)
