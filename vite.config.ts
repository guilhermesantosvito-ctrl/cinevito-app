import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true,
    // Isso traduz o código para rodar sem Tela Branca no iPad Mini 2 (iOS 12)
    target: ['es2015', 'safari12'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
