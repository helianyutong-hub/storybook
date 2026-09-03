"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFromRequest = getUserFromRequest;
const store_1 = require("../lib/store");
function getUserFromRequest(req) {
    // 优先使用自定义头部，避免线上网关覆盖标准 Authorization 头
    const custom = req.headers['x-storybook-token'];
    if (typeof custom === 'string' && custom) {
        return (0, store_1.getUserByToken)(custom);
    }
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    return (0, store_1.getUserByToken)(token);
}
//# sourceMappingURL=auth.js.map