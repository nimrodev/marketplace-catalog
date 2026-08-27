import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The browser only ever talks to localhost:5173 here — the proxy makes
    // /api same-origin from its point of view, matching production behind
    // Caddy, so the SameSite=Lax auth cookie is sent. changeOrigin below
    // just rewrites the outgoing Host header to the API; it doesn't affect
    // what the browser sees or the cookie's SameSite behavior.
    //
    // The target itself is overridable because "localhost:3000" only
    // resolves to the API when both run on the host; inside Docker Compose
    // the API is reachable at the "api" service hostname instead.
    host: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // packages/shared is pnpm-workspace-linked, not a real node_modules
    // install, so Rollup's default commonjs interop skips it and named
    // imports fail to resolve. Force it through the same interop path.
    commonjsOptions: {
      include: [/packages\/shared/, /node_modules/],
    },
  },
});
