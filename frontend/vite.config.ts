import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react-swc"
import {defineConfig} from "vite"
import process from "process"

// https://vite.dev/config/
export default defineConfig({
  // 阿里云部署在域名根路径（前后端同域名）；如需保留子路径改回 '/storybook/'
  base: '/',
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
