import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // packages/shared is pnpm-workspace-linked, not a real node_modules
    // install, so Rollup's default commonjs interop skips it and named
    // imports fail to resolve. Force it through the same interop path.
    commonjsOptions: {
      include: [/packages\/shared/, /node_modules/],
    },
  },
});
