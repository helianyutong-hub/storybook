#!/bin/bash
export PORT=4000
cd /workspace
exec node /workspace/backend/node_modules/tsx/dist/cli.mjs /workspace/backend/src/index.ts
