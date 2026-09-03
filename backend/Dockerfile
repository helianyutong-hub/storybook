# 后端运行镜像：可用于 Render / Railway / Fly.io 等任意支持 Docker 的 PaaS
FROM node:20-alpine

WORKDIR /app

# 安装兼容 Node 20 的 pnpm 9（pnpm 10+ 依赖 node:sqlite，Node 20 不支持）
RUN npm install -g pnpm@9.15.0

# 先装依赖（利用镜像层缓存）
COPY package.json pnpm-lock.yaml* .npmrc ./
RUN pnpm install --frozen-lockfile || pnpm install

# 复制源码并构建
COPY . .

# 跳过构建期类型检查的严格性（与生产一致即可）
RUN pnpm build

# PaaS 通过 PORT 环境变量注入端口；本地默认 3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "start"]
