import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * GitHub Pages serves the app from a sub-path. Every asset URL is emitted absolute so
 * that a deep link such as `/80in8/q/<id>` still resolves them; relative URLs would
 * resolve against `/80in8/q/` and 404.
 */
const base = process.env.BASE_PATH ?? '/'

/**
 * N1: the network contract, stated in the document itself. `connect-src 'self'` is the
 * part that matters — nothing the app runs can talk to anywhere else.
 * `_headers` carries the same policy for hosts that serve real headers.
 */
export const CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * Replace `__BASE__` in index.html (Vite only rewrites the URLs it generates itself)
 * and inject the CSP meta tag for builds only — the dev server needs its HMR socket,
 * which `connect-src 'self'` would block.
 */
function htmlBase(): Plugin {
  return {
    name: '80in8:html-base',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) =>
        html
          .replaceAll('__BASE__', base)
          .replace(
            '<!--__CSP__-->',
            ctx.server ? '' : `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
          ),
    },
  }
}

/**
 * GitHub Pages has no rewrite rules: it serves `404.html` for any unknown path, so a
 * copy of the shell there is what makes history routing work on a deep link.
 */
function spa404(): Plugin {
  let output = here('./dist')
  return {
    name: '80in8:spa-404',
    apply: 'build',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const index = resolve(output, 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve(output, '404.html'))
    },
  }
}

const version = process.env.npm_package_version ?? '0.1.0'
const buildId = process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  // Preact's automatic runtime; no Babel, no preset plugin.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  resolve: {
    alias: {
      // Consume the core from source so neither dev nor test needs a build step.
      '@80in8/core': here('../../packages/core/src/index.ts'),
    },
  },
  build: {
    target: 'es2022',
    cssTarget: 'safari16',
    sourcemap: true,
  },
  plugins: [
    htmlBase(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      // Registration is hand-rolled (src/adapters/sw.ts) so the update check can be
      // suspended for the duration of a run (N1: zero requests between go and finished).
      injectRegister: false,
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        // Everything is precached; there is no runtime caching and therefore no
        // network path that could fire during a run.
        runtimeCaching: [],
      },
      manifest: {
        name: '80 in 8 — mental arithmetic trainer',
        short_name: '80 in 8',
        description: '80 mental arithmetic questions in 8 minutes. Offline, private, exact.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1116',
        theme_color: '#0e1116',
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    spa404(),
  ],
})
