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

## 发版约定（重要）

**所有改动必须先不发版，等用户本地确认后再发版。** 用户明确说："以后改完内容，都先不要发版，等我先本地确认好修改的功能后，我让你发版再发版"（2026-09-04 晚）。

发版前需要用户明确指令"上线/发版"。本地 dev server 始终开着供预览。
**不要在代码改完后主动 `scp` 到服务器、不要主动 `npm run build` 后部署**——改了告诉用户、提示预览，他确认后才发。

## 容易踩的坑（必须记住）

1. **React hooks 调用顺序** —— 所有 hooks 必须在所有 early return 之前。
   典型症状：`Minified React error #310` / "Rendered more hooks than during the previous render"，
   且 `window.onerror` / `addEventListener('error')` 都抓不到（React 内部抛出）。
   只能用 ErrorBoundary 才能暴露具体错误堆栈。
   **防御性写法**：所有 `useState/useRef/useMemo/useEffect` 集中在函数顶部、early return 之前。

2. **微信 X5 内核劫持 `window.confirm` / `window.alert`** —— 连续弹窗时按钮会被劫持成
   "关闭网页"、点确认按钮无效。**永远不要在删除/退出确认里用原生 confirm**，
   改用 React state + 自定义确认条（或 sonner toast + button）。
   普通浏览器看不出问题，只有微信会触发。

3. **fixed 被 transform 容器绑架** —— 页面外层用 framer-motion `PageTransition`（带 motion.div + layout）时，
   子组件的 `position: fixed` 相对动画容器而非视口，**吸底失效、上下滑动悬空**。
   修法：要吸底的组件用 `createPortal(node, document.body)` 挂到 body 脱离 transform 容器。

4. **history confirm 弹窗的替代方案** —— 不要写自定义 `<dialog>` 组件，包袱太重。
   直接在组件里加 `const [confirmId, setConfirmId] = useState<string | null>(null)`，
   点击删除时 setConfirmId(id)，卡片内条件渲染一个 inline 确认条（带取消/确认按钮）即可。

5. **deploy 脚本的 scp+cleanup 时序** —— spawnSync 串行调用不会真的串行等待 scp 的连接关闭。
   **必须在 cleanup 之前先 `ssh ls <新bundle>` 确认已上传成功**，确认存在后才删旧文件，
   否则会把所有 JS 删光、index.html 找不到 bundle、站点彻底白屏。

## 分享验证（重要认知）

**本地 `localhost` 分享链接天然不能跨浏览器/跨设备验证**——`localhost` 只指"本机自己"，换浏览器、换手机、发给朋友都打不到分享者本机 dev server 的内容。这是本地预览的天然限制，不是 bug。截图看到"打开空白"多半是本地环境限制或 dev server 状态问题。

→ 判断"分享功能是否真修好"**必须在线上** `https://lm.lzei.cn/preview/xxx` 测试：线上前端会走已部署的公开接口 `/api/public/stories/:id`（免登录）拉取故事。后端公开接口已上线（2026-09-05，`publicStories.ts`）。

## 前端 CSS 坑（重要）

**本项目的页面外层套了 framer-motion 的页面切换动画**（`AnimatedRoutes` 的 `AnimatePresence mode="popLayout"` + `PageTransition` 的 `motion.div`，带 `layout`+位移/缩放 transform）。
**祖先一旦带 `transform`，其内部后代的 `position: fixed` 就不再相对视口，而是相对该 transform 容器**——导致"吸底/固定"失效、跟着内容跑。

→ 需要真正吸底/固定（如预览页"确认播放给孩子"条）时，**用 React Portal `createPortal(xxx, document.body)` 挂到 body**，脱离 transform 容器，`fixed bottom-0` 才相对视口。已踩坑（预览页确认条吸底失效，2026-09-04，main `3229dab7`）。



**自检端点**：`GET /api/tts/provider`（返回当前引擎、Key 是否配置、音色映射）—— 该端点存在即证明后端是新代码，可用来判断部署是否生效。

**当前状态（2026-09-05 起）**：服务器 `backend/.env` 里的 `DASHSCOPE_API_KEY` **已清掉**（用户要求省掉每次 401 的 2-3 秒，2026-09-04 深夜），后端现在**直接走 Edge TTS**，四角色音色区分度暂失、统一为温柔女声（微软中文女声）。
**恢复区分音色**：只需重新在百炼生成一个 API Key，写回服务器 `/root/storybook/backend/.env` 的 `DASHSCOPE_API_KEY=`，重启容器即可切回 CosyVoice（代码里已用正确的 `SpeechSynthesizer` 端点 + `voice` 放 `input`，见 2026-09-04 日志）。

## 环境注意

- npm 装依赖一律加 `--registry=https://registry.npmmirror.com`（官方源在国内 ECONNRESET）
- 后端用 pnpm（Docker 内），本机开发用 npm
- 本机**没装 Docker**，Dockerfile 改动无法本地验证，改完要谨慎
