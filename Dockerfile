# 多阶段构建：构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY server/package*.json ./server/

# 安装服务器依赖（包括devDependencies用于构建）
WORKDIR /app/server
RUN npm ci

# 复制服务器源代码
COPY server/src ./src
COPY server/tsconfig.json ./

# 构建TypeScript代码
RUN npm run build

# 复制前端文件
WORKDIR /app
COPY public ./public

# 复制wiki-data目录结构（空目录，数据通过卷挂载）
RUN mkdir -p wiki-data/wiki wiki-data/raw

# 生产阶段
FROM node:20-alpine

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001
ENV WIKI_ROOT=/app/wiki-data
ENV OPENCLAUDE_EXECUTABLE_PATH=/usr/local/bin/openclaude

# 设置工作目录
WORKDIR /app

# 全局安装OpenClaude CLI（必须在创建用户前以root身份安装）
RUN npm install -g @gitlawb/openclaude@0.3.0

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p wiki-data && \
    chown -R nodejs:nodejs /app

# 从构建阶段复制node_modules和构建产物
COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/wiki-data ./wiki-data

# 复制package.json和package-lock.json
COPY --from=builder --chown=nodejs:nodejs /app/server/package*.json ./server/

# 安装生产依赖
RUN cd /app/server && npm ci --only=production

# 切换到非root用户
USER nodejs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/wiki/status || exit 1

# 启动命令
CMD ["node", "server/dist/index.js"]