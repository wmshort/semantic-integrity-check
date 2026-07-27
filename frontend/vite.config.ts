import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend talks to the local backend proxy on :8000. In dev, Vite serves
// on :5173; the built assets are served by nginx on :80 (mapped to :8080).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
