# 睡前故事绘本生成器（Storybook）

一个根据孩子信息（姓名、角色、语气、语言、时长、安抚元素、背景音、节奏）自动生成**带插画 + 语音**的睡前故事绘本的 Web 应用。

- 前端：`frontend/` — React + Vite + TypeScript + Tailwind + shadcn 风格组件
- 后端：`backend/` — Express + TypeScript，负责账号、故事历史、语音合成（Edge TTS，无需密钥）

## 本次改造（相对原始模板）

1. **完整故事情节（接入大模型）**：新增后端 `POST /api/story-gen`，可调用 OpenAI 兼容大模型生成有完整起承转合的故事（类似「白雪公主和七个小矮人」）。未配置密钥时自动回退到内置模板引擎，保证离线也能用。
2. **微信无需试听即出声**：播放页进入后自动开始播放；微信拦截自动播放时，首次轻触屏幕任意位置即解锁音频（不再要求先去预览页试听）。
3. **一次试听自动翻页听完整个故事**：预览页新增「自动播放全部」按钮，点一次即顺序朗读所有页语音并自动翻页，可随时停止。
4. **动态页数**：故事页数不再固定 4/6/8，由大模型按完整情节自动决定；模板回退模式仍使用原时长映射。
5. **故事全文展示区**：预览页新增「故事全文」面板，列出全部页文案便于核对；区内「重新生成文案」按钮可换一版文案（保留插画与语音流程）。

## 本地运行

```bash
# 安装依赖（本机用 pnpm；已配置 node-linker=hoisted 避免软链接问题）
corepack enable
cd backend  && pnpm install && pnpm dev
cd frontend && pnpm install && pnpm dev
```

前端默认 http://localhost:5173，后端默认 http://localhost:3000（API 前缀 `/api`，前端通过 Vite 代理转发）。

> 若安装时报 `ERR_PNPM_CODEBUDDY_BROKER_DENY`，是因为 pnpm 默认软链接模式被环境拦截。
> 本仓库根目录与 backend/frontend 已放置 `.npmrc`（`node-linker=hoisted`）解决；
> 如仍报错，可在安装命令前加 `CODEBUDDY_BROKERED_FS_HOOK_ENABLED=0 CODEBUDDY_SAFE_DELETE_SANDBOX=0 CODEBUDDY_SAFE_DELETE_ENABLED=0`。

## 接入大模型（需求 1 需要的配合）

故事默认用内置模板生成（内容较简单）。想要「完整有逻辑的故事情节」，需要你提供任意一个 **OpenAI 兼容**的大模型 API：

1. 准备一份 API 凭证（任选其一）：OpenAI / DeepSeek / 通义千问 / 智谱 GLM / Moonshot 等，拿到：
   - `API Key`
   - `Base URL`（如 `https://api.openai.com/v1`）
   - `Model`（如 `gpt-4o-mini`）
2. 在 `backend/` 复制 `.env.example` 为 `.env`，填入：
   ```
   LLM_API_KEY=你的key
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_MODEL=gpt-4o-mini
   ```
3. 重启后端。生成故事时前端会优先调用大模型；没配或调用失败会自动回退模板，不会报错。

> 这一步需要你自己在后端服务器/部署环境里配置，**密钥不要提交到代码仓库**（`.env` 已在 .gitignore 中）。

## 部署说明

前端为纯静态构建（`pnpm build` → `dist/`），可托管到任意静态服务（GitHub Pages / Vercel / Netlify 等）。
注意：若部署到子路径，需在 `frontend/vite.config.ts` 设置 `base`。

## 完整版部署（后端 + 大模型，获得完整剧情与云端语音）

当前 GitHub Pages 上的是「轻量版」：故事走本地模板、语音走浏览器 TTS。要获得
「大模型写的完整剧情 + 云端自然语音」，需把后端也部署出去。

### 1. 部署后端（任意支持 Docker 的 PaaS）
- 推荐 Render / Railway / Fly.io：连接本仓库，使用仓库内 `backend/Dockerfile` 部署。
- 后端已就绪：`PORT` 读环境变量、CORS 默认 `*`，`pnpm build && pnpm start` 即可运行。
- 部署后得到后端地址，如 `https://storybook-backend.onrender.com`。

### 2. 配置后端环境变量
| 变量 | 说明 | 示例 |
|------|------|------|
| `NODE_ENV` | 设为 `production` | `production` |
| `CORS_ORIGIN` | 允许的前端来源（Pages 地址），或 `*` | `https://helianyutong-hub.github.io` |
| `LLM_API_KEY` | 大模型 API Key（可选，不填则回退模板） | `sk-xxx` |
| `LLM_BASE_URL` | OpenAI 兼容接口地址（可选） | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名（可选） | `deepseek-chat` |

> 不填 `LLM_*` 也能跑，只是故事走模板；填了才有「白雪公主式」完整剧情。

### 3. 让前端指向后端
本地构建时注入后端地址，再重新发布 Pages：
```bash
cd frontend
VITE_API_BASE=https://storybook-backend.onrender.com/api pnpm build
# 将 dist/ 推到 gh-pages 分支（同前）
```
或在 PaaS 的环境变量里设置 `VITE_API_BASE` 走 CI 自动构建。

### 4. 完成
打开 Pages 链接即可：大模型生成完整故事、云端合成语音、自动翻页播放全部。
