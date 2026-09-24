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
    // 生产构建压缩并彻底剔除所有注释（含法律声明横幅），部署产物不暴露源码注释
    minify: 'esbuild',
    esbuild: {
      legalComments: 'none',
    },
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
        // 本地没有后端时（后端部署在阿里云），默认把 /api 代理到线上后端，
        // 这样直接 `npm run dev` 就能连真实后端联调预览。
        // 若本机起了后端(:3000)，用 VITE_PROXY_TARGET=http://localhost:3000 npm run dev 覆盖。
        target: process.env.VITE_PROXY_TARGET || 'https://lm.lzei.cn',
        changeOrigin: true,
        secure: true,
        ws: true,
      },
    },
  },
})
