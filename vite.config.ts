import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    root: 'dashboard',
    base: '/operator/',
    build: {
        outDir: '../dist/dashboard',
        emptyOutDir: true,
    },
    server: {
        port: 3001,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});
