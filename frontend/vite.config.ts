import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react-swc"
import {defineConfig} from "vite"
import process from "process"

// https://vite.dev/config/
export default defineConfig({
  // 部署路径：默认根路径（阿里云同源部署，前后端共用一个域名）。
  // 若还要部署到 GitHub Pages 子路径，构建时设 VITE_BASE_PATH=/storybook/ 即可。
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // 兼容微信内置浏览器 / 旧版 WebView
    target: ['es2015', 'chrome61'],
    cssTarget: 'chrome61',
  },
  server: {
    host: '::',
    port: 5173,
    allowedHosts: true,
    cors: true,
    hmr: {
        protocol: 'wss',
        host: `5173-${process.env.X_IDE_SPACE_KEY}.e2b.${process.env.X_IDE_SPACE_REGION}.${process.env.X_IDE_SPACE_HOST}`
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true
      },
    },
  },
})
