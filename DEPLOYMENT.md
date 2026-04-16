# LLM Wiki Docker部署指南

## 概述

本文档提供LLM Wiki项目的Docker容器化部署指南。通过Docker部署，您可以避免环境依赖冲突和硬编码路径问题，实现一键部署。

## 前提条件

1. **Docker**：安装Docker Engine 20.10+
2. **Docker Compose**：安装Docker Compose 2.0+
3. **Anthropic API密钥**：有效的Anthropic API密钥

## 快速开始

### 1. 克隆项目（如果尚未克隆）
```bash
git clone <repository-url>
cd llm-wiki-app
```

### 2. 配置环境变量
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑.env文件，设置您的API密钥
# 使用文本编辑器打开.env文件，设置ANTHROPIC_API_KEY
```

### 3. 一键启动
```bash
# 使用docker-compose启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 4. 访问应用
打开浏览器访问：http://localhost:3001

## 详细配置

### 环境变量说明

在`.env`文件中配置以下变量：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | 否 | 3001 | 服务器端口 |
| `NODE_ENV` | 否 | production | 运行环境 |
| `WIKI_ROOT` | 否 | /app/wiki-data | Wiki数据目录（容器内路径） |
| `ANTHROPIC_API_KEY` | 是 | 无 | Anthropic API密钥 |
| `ANTHROPIC_BASE_URL` | 否 | https://api.anthropic.com | API端点 |
| `ANTHROPIC_MODEL` | 否 | claude-3-5-sonnet-20241022 | 模型名称 |

### 数据持久化

Wiki数据存储在`wiki-data`目录中，通过Docker卷挂载实现持久化：

- 本地目录：`./wiki-data`
- 容器内路径：`/app/wiki-data`

首次启动时会自动创建目录结构：
```
wiki-data/
├── wiki/      # Wiki页面
├── raw/       # 原始文件
├── index.md   # 索引文件
└── log.md     # 日志文件
```

### 自定义配置

#### 修改端口
```bash
# 在.env文件中设置
PORT=8080

# 在docker-compose.yml中修改端口映射
ports:
  - "8080:3001"
```

#### 使用不同的模型
```bash
# 在.env文件中设置
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

#### 使用OpenAI兼容API
```bash
# 在.env文件中设置
ANTHROPIC_BASE_URL=https://your-openai-compatible-endpoint.com
# 可选：设置OpenAI模式
CLAUDE_CODE_USE_OPENAI=1
```

## 管理命令

### 启动服务
```bash
# 后台启动
docker-compose up -d

# 前台启动（查看日志）
docker-compose up
```

### 停止服务
```bash
# 停止服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v
```

### 查看状态
```bash
# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f llm-wiki
```

### 重启服务
```bash
# 重启服务
docker-compose restart

# 重新构建并启动
docker-compose up -d --build
```

### 进入容器
```bash
# 进入容器shell
docker-compose exec llm-wiki sh

# 查看容器内文件
docker-compose exec llm-wiki ls -la /app
```

## 手动构建和运行

### 构建Docker镜像
```bash
# 构建镜像
docker build -t llm-wiki .

# 查看镜像
docker images | grep llm-wiki
```

### 运行容器
```bash
# 运行容器（带环境变量）
docker run -d \
  --name llm-wiki \
  -p 3001:3001 \
  -e ANTHROPIC_API_KEY=your_api_key \
  -e WIKI_ROOT=/app/wiki-data \
  -v $(pwd)/wiki-data:/app/wiki-data \
  llm-wiki

# 运行容器（使用.env文件）
docker run -d \
  --name llm-wiki \
  -p 3001:3001 \
  --env-file .env \
  -v $(pwd)/wiki-data:/app/wiki-data \
  llm-wiki
```

## 故障排除

### 1. 端口冲突
如果端口3001已被占用，修改端口：
```bash
# 修改.env文件中的PORT
PORT=3002

# 修改docker-compose.yml中的端口映射
ports:
  - "3002:3002"
```

### 2. API密钥错误
检查API密钥是否正确：
```bash
# 查看容器日志
docker-compose logs llm-wiki | grep -i "api\|key\|auth"

# 验证环境变量
docker-compose exec llm-wiki env | grep ANTHROPIC
```

### 3. 权限问题
如果遇到文件权限问题：
```bash
# 确保wiki-data目录可写
chmod -R 755 wiki-data

# 或者重建容器
docker-compose down
docker-compose up -d --force-recreate
```

### 4. 容器健康检查失败
```bash
# 检查健康状态
docker-compose ps

# 手动检查API端点
curl http://localhost:3001/api/wiki/status
```

### 5. 磁盘空间不足
清理未使用的Docker资源：
```bash
# 清理未使用的镜像、容器、卷
docker system prune -a

# 仅清理未使用的卷
docker volume prune
```

## 备份和恢复

### 备份Wiki数据
```bash
# 备份wiki-data目录
tar -czf wiki-data-backup-$(date +%Y%m%d).tar.gz wiki-data/

# 备份到远程
scp wiki-data-backup-*.tar.gz user@remote:/backup/
```

### 恢复Wiki数据
```bash
# 停止服务
docker-compose down

# 恢复数据
tar -xzf wiki-data-backup-YYYYMMDD.tar.gz

# 启动服务
docker-compose up -d
```

## 生产环境建议

### 1. 使用反向代理
建议使用Nginx或Traefik作为反向代理：
```nginx
# Nginx配置示例
server {
    listen 80;
    server_name wiki.example.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 启用HTTPS
使用Let's Encrypt或商业SSL证书。

### 3. 监控和日志
- 配置Docker日志驱动
- 使用Prometheus + Grafana监控
- 设置日志轮转

### 4. 安全建议
- 定期更新Docker镜像
- 使用非root用户运行容器
- 限制容器资源使用
- 定期备份数据

## 更新版本

### 从Git更新
```bash
# 拉取最新代码
git pull

# 重建并重启
docker-compose up -d --build
```

### 从Docker镜像更新
```bash
# 拉取最新镜像
docker-compose pull

# 重启服务
docker-compose up -d
```

## 支持

如有问题，请检查：
1. Docker和Docker Compose版本
2. 环境变量配置
3. 容器日志：`docker-compose logs llm-wiki`
4. 网络连接和防火墙设置

## 许可证

本项目基于MIT许可证发布。