import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Builds the same React UI for Android (Capacitor) and browsers, into
 * out/mobile. There is no Electron preload here: main.tsx sees no
 * window.storyteller and runs the core in-page (src/renderer/src/platform/web.ts).
 */
function mobileHtml(): Plugin {
  return {
    name: 'storyteller-mobile-html',
    transformIndexHtml(html) {
      return (
        html
          // Capacitor injects its bridge as an inline <script>, and requests may
          // go straight to source APIs (browsers) or through the native bridge.
          .replace(
            /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
            `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' https: http: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https: http:" />`
          )
          // Draw under the status/navigation bars; CSS pads with the safe-area insets.
          .replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
      )
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), mobileHtml()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') }
  },
  build: {
    outDir: resolve(__dirname, 'out/mobile'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1500
  }
})
