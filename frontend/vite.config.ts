import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In dev, forward API calls to Django so the frontend can use relative URLs.
  server: { proxy: { '/api': 'http://localhost:8000' } },
});
