import express, { Application } from 'express'
import cors from 'cors'
import compression from 'compression'
import path from 'path'
import fs from 'fs'
import 'express-async-errors'
import { env } from './config/env'
import { errorHandler } from './middleware/errorHandler'
import { httpLogger } from './middleware/logger'
import { systemRouter } from './modules/system'
import { authRouter } from './modules/auth'
import { storiesRouter } from './modules/stories'
import { preferencesRouter } from './modules/preferences'
import { ttsRouter } from './modules/tts'
import { storyGenRouter } from './modules/storyGen'

export const createApp = (): Application => {
  const app = express()

  // HTTP request logging
  app.use(httpLogger)

  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN,
      credentials: env.CORS_ORIGIN !== '*',
    })
  )

  // Body parsing and compression
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true, limit: '2mb' }))
  app.use(compression())

  // API routes - System & Health
  app.use(env.API_PREFIX, systemRouter)

  // 领域模块路由
  app.get(`${env.API_PREFIX}/health`, (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  app.use(`${env.API_PREFIX}/auth`, authRouter)
  app.use(`${env.API_PREFIX}/stories`, storiesRouter)
  app.use(`${env.API_PREFIX}/preferences`, preferencesRouter)
  app.use(`${env.API_PREFIX}/tts`, ttsRouter)
  app.use(`${env.API_PREFIX}/story-gen`, storyGenRouter)

  // 单端口部署：直接托管前端构建产物（仅供发布/分享使用）
  // 兼容在不同工作目录下启动（/workspace 或 /workspace/backend）
  const cwd = process.cwd()
  const distCandidates = [
    path.resolve(cwd, 'frontend/dist'),
    path.resolve(cwd, '../frontend/dist'),
  ]
  const frontendDist = distCandidates.find((p) => fs.existsSync(p)) ?? distCandidates[0]
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist))
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      if (req.path.startsWith(env.API_PREFIX)) return next()
      if (path.extname(req.path)) return next()
      res.sendFile(path.join(frontendDist, 'index.html'))
    })
  }

  // Error handling
  app.use(errorHandler)

  return app
}
