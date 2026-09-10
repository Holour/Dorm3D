import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    server: { port: Number(env.PORT) || 5173, strictPort: true, host: '127.0.0.1' },
    preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
    build: { target: 'es2022', chunkSizeWarningLimit: 700 },
  };
});
