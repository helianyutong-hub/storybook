# 项目长期记忆：故事书（storybook）

## 项目是什么

AI 生成儿童睡前故事的 Web App。前端 React + Vite，后端 Node + Fastify，
数据存本地 JSON 文件（`backend/data/`），语音合成走阿里云 CosyVoice（未配 Key 时回退 Edge TTS）。

GitHub：`helianyutong-hub/storybook`（main = 源码，gh-pages = 前端构建产物）

## 构建约定（重要）

**前端一律用 `npm run build`，不要用 `npx vite build`。**

`package.json` 里 `"build": "tsc -b && vite build"` —— 会做严格类型检查。
直接 `npx vite build` 只转译打包、不查类型，会让类型错误一直潜伏。
2026-09-04 就因为一直用 vite build，掩盖了 4 个 TS 错误（见当日日志）。

后端类型检查：`npx tsc --noEmit -p tsconfig.json`

## 部署架构

两条部署线并存：

| | 前端 | 后端 |
|---|---|---|
| 当前线上 | GitHub Pages（子路径 `/storybook/`） | Render（自动同步 main 分支） |
| 计划中 | 阿里云服务器 + Nginx | 同服务器 Docker（同源部署） |

- **vite base 用环境变量控制**：`base: process.env.VITE_BASE_PATH || '/'`
  根路径（阿里云同源）默认；GitHub Pages 构建时设 `VITE_BASE_PATH=/storybook/`
- 后端 Docker 只监听 `127.0.0.1:3000`，对外靠 Nginx 反代 `/api/`
- 后端 `Dockerfile` 支持 `--build-arg NPM_REGISTRY=<镜像源>` 加速国内构建（默认官方源）

## 语音合成

音色映射在 `backend/src/lib/tts.ts` 的 `ALIYUN_VOICE`：

| 角色 | voice 参数 | 特征 |
|---|---|---|
| 宝妈 | `longwanjun_v3` | 细腻柔声女 20-30 |
| 宝爸 | `longanyun_v3` | 居家暖男 30-35 |
| 爷爷 | `longlaobo_v3` | 沧桑岁月爷 60+ |
| 奶奶 | `longlaoyi_v3` | 烟火从容阿姨 60+ |

自检端点 `GET /api/tts/provider`（返回当前引擎、Key 是否配置、音色映射）
—— **该端点存在即证明后端是新代码**，可用来判断部署是否生效。

## 环境注意

- npm 装依赖一律加 `--registry=https://registry.npmmirror.com`（官方源在国内 ECONNRESET）
- 后端用 pnpm（Docker 内），本机开发用 npm
- 本机**没装 Docker**，Dockerfile 改动无法本地验证，改完要谨慎
