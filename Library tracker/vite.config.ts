import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Expose on local network so you can scan from a phone
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-zxing': ['@zxing/browser', '@zxing/library'],
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});
