import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/loadtest.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // The shared workspace package ships TypeScript sources, so it must be bundled.
  noExternal: ['@xbrain/shared'],
  external: ['@prisma/client', '.prisma/client', 'colyseus.js'],
});
