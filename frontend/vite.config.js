import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    //host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    },
    /*https: {
      key: fs.readFileSync("/home/debian11/BigNerd/cert/localhost/localhost.decrypted.key"),
      cert: fs.readFileSync("/home/debian11/BigNerd/cert/localhost/localhost.crt"),
      },
      hmr: {
          host: "B1gNerd.eu",
      },*/
    },
})
