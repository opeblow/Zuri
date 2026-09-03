import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['pellet-construct-subscript.ngrok-free.dev'],
    port: 5173,
    // proxy: {
    //   '/api': {
    //     target: 'https://pellet-construct-subscript.ngrok-free.dev/api',
    //     changeOrigin: true,
    //     rewrite: (p) => p.replace(/^\/api/, ''),
    //   },
    // },
  },
});
