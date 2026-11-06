import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');
  const serverUrl = env.VITE_SERVER_URL || `http://localhost:${env.SERVER_PORT || 2567}`;
  return {
    plugins: [react()],
    // Separate dependency cache when running a second dev stack side by side (e.g. Windows + WSL)
    cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
    envDir: path.resolve(__dirname, '../..'),
    resolve: {
      alias: {
        '@xbrain/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      port: Number(env.WEB_PORT || process.env.PORT || 5173),
      strictPort: false,
      host: true,
      proxy: {
        // Same-origin API in dev (WebSocket goes directly to the game server).
        '/api': { target: serverUrl, changeOrigin: true },
      },
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            r3f: ['@react-three/fiber', '@react-three/drei'],
            physics: ['@react-three/rapier'],
            net: ['colyseus.js', 'livekit-client'],
          },
        },
      },
    },
  };
});
