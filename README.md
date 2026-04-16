# LLM Wiki - 基于OpenClaude的知识库系统

一个基于OpenClaude SDK的智能知识库系统，支持文档摄取、智能查询和Wiki健康检查。

## 🌟 功能特性

- **智能文档摄取**：自动处理源文件，更新Wiki页面、索引和日志
- **自然语言查询**：基于Wiki内容回答自然语言问题
- **Wiki健康检查**：检测一致性、过时信息、孤立页面等问题
- **实时消息流**：实时显示LLM工具调用和操作进度
- **WebSocket通信**：支持实时操作状态更新
- **持久化知识库**：所有操作结果保存到本地Wiki结构

## 🚀 快速开始

### 前置要求
- Docker 20.10+ 和 Docker Compose 2.0+
- Anthropic API密钥（获取地址：[Anthropic Console](https://console.anthropic.com)）

### 3分钟部署

```bash
# 1. 克隆项目
git clone <repository-url>
cd llm-wiki-app

# 2. 配置API密钥
cp .env.example .env
# 编辑.env文件，设置ANTHROPIC_API_KEY=your_api_key_here

# 3. 一键启动
chmod +x run.sh
./run.sh start

# 4. 访问应用
# 打开浏览器: http://localhost:3001
```

### 🚀 在GitHub Codespace中运行

1. **打开GitHub Codespace**
   - 在仓库页面点击 "Code" > "Codespaces" > "Create codespace on main"
   - 等待环境初始化完成

2. **安装依赖**
   ```bash
   cd server
   npm install
   ```

3. **安装OpenClaude CLI**
   ```bash
   npm install -g @gitlawb/openclaude@0.1.8
   # 验证安装
   openclaude --version
   ```

4. **设置环境变量**
   ```bash
   export ANTHROPIC_API_KEY=your_api_key_here
   # 或者编辑 .env 文件
   cp .env.example .env
   # 编辑 .env 文件设置您的API密钥
   ```

5. **构建并运行**
   ```bash
   npm run build
   npm start
   ```

6. **访问应用**
   - Codespace会自动转发端口
   - 点击终端中的 "Open in Browser" 链接
   - 或访问: https://{your-codespace-url}-3001.app.github.dev

> **注意**: wiki-data目录在首次运行时自动创建，包含初始的index.md和log.md文件。

## 📁 项目结构

```
llm-wiki-app/
├── server/              # Node.js后端（TypeScript）
│   ├── src/            # 源代码
│   ├── dist/           # 编译输出
│   └── package.json    # 后端依赖
├── public/             # 静态前端
│   ├── index.html      # 主页面
│   ├── app.js          # 前端逻辑
│   └── style.css       # 样式表
├── wiki-data/          # Wiki数据目录（自动创建）
│   ├── wiki/           # Wiki页面
│   ├── raw/            # 原始文件
│   ├── index.md        # 索引文件
│   └── log.md          # 日志文件
├── Dockerfile          # Docker构建配置
├── docker-compose.yml  # Docker编排配置
├── .env.example        # 环境变量模板
├── run.sh              # 一键管理脚本
├── DEPLOYMENT.md       # 详细部署指南
└── README.md           # 本文档
```

## 🔧 使用方法

### 1. 设置Wiki根目录
- 默认：`/app/wiki-data`（容器内）
- 可通过`.env`文件的`WIKI_ROOT`自定义

### 2. 处理源文件（Ingest）
1. 在"文件浏览器"中选择或输入文件路径
2. 点击"浏览文件"预览内容
3. 点击"开始Ingest处理"启动处理

### 3. 查询Wiki（Query）
1. 切换到"Query"选项卡
2. 输入自然语言问题
3. LLM将搜索Wiki并生成答案

### 4. 健康检查（Lint）
1. 切换到"Lint"选项卡
2. 点击"执行Lint检查"
3. 查看Wiki一致性报告

## ⚙️ 配置选项

### 环境变量
在`.env`文件中配置：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | 否 | 3001 | 服务器端口 |
| `WIKI_ROOT` | 否 | /app/wiki-data | Wiki数据目录 |
| `ANTHROPIC_API_KEY` | 是 | 无 | Anthropic API密钥 |
| `ANTHROPIC_BASE_URL` | 否 | https://api.anthropic.com | API端点 |
| `ANTHROPIC_MODEL` | 否 | claude-3-5-sonnet-20241022 | 模型名称 |

### 自定义模型
支持所有Claude系列模型：
- `claude-3-5-sonnet-20241022`（推荐）
- `claude-3-opus-20240229`
- `claude-3-haiku-20240307`

## 📊 管理命令

使用`run.sh`脚本管理服务：

```bash
# 启动服务
./run.sh start

# 停止服务
./run.sh stop

# 重启服务
./run.sh restart

# 查看状态
./run.sh status

# 查看日志
./run.sh logs

# 备份数据
./run.sh backup

# 更新服务
./run.sh update

# 清理资源
./run.sh clean
```

## 🔒 安全建议

1. **API密钥保护**
   - 不要在代码中硬编码API密钥
   - 使用环境变量或密钥管理服务
   - 定期轮换密钥

2. **访问控制**
   - 使用反向代理（Nginx）限制访问
   - 配置防火墙规则
   - 启用HTTPS加密

3. **数据安全**
   - 定期备份`wiki-data`目录
   - 设置适当的文件权限
   - 监控磁盘使用情况

## 🌐 生产部署

### 使用反向代理（Nginx）
```nginx
server {
    listen 80;
    server_name wiki.yourdomain.com;
    
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

### 启用HTTPS
使用Let's Encrypt或商业SSL证书。

### 资源监控
- 使用`docker stats`监控容器资源
- 设置日志轮转
- 监控API使用成本

## 🔄 更新版本

### 从Git更新
```bash
# 拉取最新代码
git pull

# 更新服务
./run.sh update
```

### 从Docker镜像更新
```bash
# 拉取最新镜像
docker-compose pull

# 重启服务
docker-compose up -d
```

## 🐛 故障排除

### 常见问题

1. **API密钥错误**
   ```bash
   # 检查环境变量
   docker-compose exec llm-wiki env | grep ANTHROPIC
   
   # 查看日志
   ./run.sh logs | grep -i "api\|key\|auth"
   ```

2. **端口冲突**
   - 修改`.env`中的`PORT`变量
   - 修改`docker-compose.yml`中的端口映射

3. **权限问题**
   ```bash
   # 确保wiki-data目录可写
   chmod -R 755 wiki-data
   
   # 重建容器
   docker-compose down
   docker-compose up -d --force-recreate
   ```

4. **磁盘空间不足**
   ```bash
   # 清理未使用的Docker资源
   docker system prune -a
   ```

### 获取帮助
1. 查看详细日志：`./run.sh logs`
2. 检查容器状态：`docker-compose ps`
3. 测试API端点：`curl http://localhost:3001/api/wiki/status`

## 📈 使用案例

### 团队知识库
- 文档集中管理
- 智能搜索和问答
- 知识传承和培训

### 个人学习笔记
- 整理学习资料
- 构建个人知识图谱
- 快速复习和查询

### 项目文档
- 自动化文档生成
- 代码知识库
- 团队协作工具

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 创建Pull Request

## 📄 许可证

MIT License

## 🙏 致谢

- [OpenClaude SDK](https://github.com/codrstudio/openclaude-sdk) - 提供LLM交互能力
- [Anthropic Claude](https://www.anthropic.com) - 强大的语言模型
- Docker社区 - 容器化技术支持

---

**开始使用**: [快速开始](#-快速开始) | [配置说明](#️-配置选项) | [管理命令](#-管理命令)

**获取帮助**: [故障排除](#-故障排除) | [使用案例](#-使用案例) | [贡献指南](#-贡献指南)