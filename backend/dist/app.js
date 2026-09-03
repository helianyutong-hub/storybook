"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
require("express-async-errors");
const env_1 = require("./config/env");
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./middleware/logger");
const system_1 = require("./modules/system");
const auth_1 = require("./modules/auth");
const stories_1 = require("./modules/stories");
const preferences_1 = require("./modules/preferences");
const tts_1 = require("./modules/tts");
const storyGen_1 = require("./modules/storyGen");
const createApp = () => {
    const app = (0, express_1.default)();
    // HTTP request logging
    app.use(logger_1.httpLogger);
    app.use((0, cors_1.default)({
        origin: env_1.env.CORS_ORIGIN === '*' ? '*' : env_1.env.CORS_ORIGIN,
        credentials: env_1.env.CORS_ORIGIN !== '*',
    }));
    // Body parsing and compression
    app.use(express_1.default.json({ limit: '2mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '2mb' }));
    app.use((0, compression_1.default)());
    // API routes - System & Health
    app.use(env_1.env.API_PREFIX, system_1.systemRouter);
    // 领域模块路由
    app.get(`${env_1.env.API_PREFIX}/health`, (_req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString() });
    });
    app.use(`${env_1.env.API_PREFIX}/auth`, auth_1.authRouter);
    app.use(`${env_1.env.API_PREFIX}/stories`, stories_1.storiesRouter);
    app.use(`${env_1.env.API_PREFIX}/preferences`, preferences_1.preferencesRouter);
    app.use(`${env_1.env.API_PREFIX}/tts`, tts_1.ttsRouter);
    app.use(`${env_1.env.API_PREFIX}/story-gen`, storyGen_1.storyGenRouter);
    // 单端口部署：直接托管前端构建产物（仅供发布/分享使用）
    // 兼容在不同工作目录下启动（/workspace 或 /workspace/backend）
    const cwd = process.cwd();
    const distCandidates = [
        path_1.default.resolve(cwd, 'frontend/dist'),
        path_1.default.resolve(cwd, '../frontend/dist'),
    ];
    const frontendDist = distCandidates.find((p) => fs_1.default.existsSync(p)) ?? distCandidates[0];
    if (fs_1.default.existsSync(frontendDist)) {
        app.use(express_1.default.static(frontendDist));
        app.use((req, res, next) => {
            if (req.method !== 'GET')
                return next();
            if (req.path.startsWith(env_1.env.API_PREFIX))
                return next();
            if (path_1.default.extname(req.path))
                return next();
            res.sendFile(path_1.default.join(frontendDist, 'index.html'));
        });
    }
    // Error handling
    app.use(errorHandler_1.errorHandler);
    return app;
};
exports.createApp = createApp;
//# sourceMappingURL=app.js.map