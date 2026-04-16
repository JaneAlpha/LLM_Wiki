# Docker容器化方案测试验证

## 修改清单

### 已完成的修改

1. **前端路径抽象化** (`public/app.js`)
   - 第5行: `this.currentPath = '';` (原硬编码路径已移除)
   - 路径通过API `/api/wiki/root` 动态获取

2. **后端路径配置** (`server/src/wiki-service-v2.ts`)
   - 第18行: 支持环境变量 `WIKI_ROOT`
   - 配置优先级: 构造函数参数 > 环境变量 > 默认值
   - 生产环境默认: `/app/wiki-data`
   - 开发环境默认: `path.join(process.cwd(), 'wiki-data')`

3. **后端静态文件服务** (`server/src/index.ts`)
   - 第53-57行: 根据环境变量动态设置静态文件路径
   - 生产环境: `/app/public`
   - 开发环境: `path.join(__dirname, '../../public')`

4. **后端默认路由** (`server/src/index.ts`)
   - 第216-220行: 根据环境变量动态设置index.html路径

5. **新增Docker配置文件**
   - `Dockerfile`: 多阶段构建，生产优化
   - `.env.example`: 环境变量模板
   - `docker-compose.yml`: 一键部署配置
   - `DEPLOYMENT.md`: 详细部署文档
   - `run.sh`: 一键启动脚本

## 测试验证步骤

### 步骤1: 环境准备
```bash
# 1. 复制环境配置
cp .env.example .env

# 2. 编辑.env文件，设置API密钥
# 使用文本编辑器打开.env，设置:
# ANTHROPIC_API_KEY=your_actual_api_key_here
```

### 步骤2: 本地开发测试
```bash
# 1. 启动开发服务器
cd server
npm run dev

# 2. 访问 http://localhost:3001
# 3. 验证功能:
#    - 页面正常加载
#    - API端点可访问: http://localhost:3001/api/wiki/root
#    - 文件浏览功能正常
#    - Ingest/Query/Lint操作正常
```

### 步骤3: Docker构建测试
```bash
# 1. 构建Docker镜像
docker build -t llm-wiki .

# 2. 运行测试容器
docker run -d \
  --name llm-wiki-test \
  -p 3001:3001 \
  -e ANTHROPIC_API_KEY=your_api_key \
  -v $(pwd)/wiki-data:/app/wiki-data \
  llm-wiki

# 3. 验证容器运行
docker ps | grep llm-wiki

# 4. 访问 http://localhost:3001
# 5. 检查日志
docker logs llm-wiki-test
```

### 步骤4: Docker Compose测试
```bash
# 1. 使用docker-compose启动
docker-compose up -d

# 2. 查看状态
docker-compose ps

# 3. 查看日志
docker-compose logs -f

# 4. 验证服务
curl http://localhost:3001/api/wiki/status
```

### 步骤5: 功能验证清单

#### API端点验证
```bash
# 1. Wiki根目录
curl http://localhost:3001/api/wiki/root
# 预期: {"root":"/app/wiki-data"}

# 2. Wiki状态
curl http://localhost:3001/api/wiki/status
# 预期: JSON格式状态信息

# 3. 目录浏览
curl "http://localhost:3001/api/fs/list?path=/app/wiki-data"
# 预期: 目录和文件列表
```

#### 前端功能验证
1. **页面加载**: 访问 http://localhost:3001
2. **路径显示**: 检查页面显示的Wiki根目录
3. **文件浏览**: 使用左侧文件浏览器
4. **操作测试**:
   - Ingest: 选择文件并处理
   - Query: 输入问题并查询
   - Lint: 执行健康检查

#### 数据持久化验证
```bash
# 1. 创建测试文件
echo "Test content" > wiki-data/test.txt

# 2. 重启容器
docker-compose restart

# 3. 验证文件存在
docker-compose exec llm-wiki ls -la /app/wiki-data/
# 预期: 能看到test.txt文件
```

## 预期结果

### 成功标准
1. ✅ 前端无硬编码路径
2. ✅ 后端支持环境变量配置
3. ✅ Docker镜像构建成功
4. ✅ 容器启动正常
5. ✅ 所有功能正常工作
6. ✅ 数据持久化正常

### 向后兼容性
- 现有功能不应被破坏
- 开发环境仍可使用原有方式运行
- 生产环境通过Docker部署

## 故障排除

### 常见问题

#### 1. API密钥错误
```
错误: Ingest处理失败: 401 Unauthorized
```
**解决**: 检查`.env`文件中的`ANTHROPIC_API_KEY`设置

#### 2. 端口冲突
```
错误: bind: address already in use
```
**解决**: 修改`.env`中的`PORT`或停止占用端口的进程

#### 3. 权限问题
```
错误: EACCES: permission denied
```
**解决**: 确保`wiki-data`目录可写
```bash
chmod -R 755 wiki-data
```

#### 4. 容器启动失败
```bash
# 查看详细日志
docker-compose logs llm-wiki

# 重建容器
docker-compose up -d --build --force-recreate
```

## 性能测试

### 资源使用
```bash
# 查看容器资源使用
docker stats llm-wiki

# 内存使用应 < 500MB
# CPU使用应 < 50%
```

### 响应时间
```bash
# 测试API响应时间
time curl -s http://localhost:3001/api/wiki/status > /dev/null
# 预期: < 1秒
```

## 安全验证

### 非root用户
```bash
# 验证容器以非root用户运行
docker-compose exec llm-wiki whoami
# 预期: nodejs
```

### 文件权限
```bash
# 验证文件权限
docker-compose exec llm-wiki ls -la /app
# 预期: 所有文件属主为nodejs
```

## 完成验证

当所有测试通过后，Docker容器化方案即可投入生产使用。

### 最终检查清单
- [ ] 环境变量配置正确
- [ ] Docker镜像构建成功
- [ ] 容器启动正常
- [ ] 前端功能正常
- [ ] 后端API正常
- [ ] 数据持久化正常
- [ ] 性能符合要求
- [ ] 安全配置正确