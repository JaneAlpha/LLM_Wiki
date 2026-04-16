import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { WikiServiceV2 } from './wiki-service-v2';

// WebSocket消息类型
interface WSMessage {
  type: string;
  [key: string]: any;
}

interface OperationRequest extends WSMessage {
  type: 'operation_request';
  operation: 'ingest' | 'query' | 'lint';
  id: string;
  data: {
    filePath?: string;
    question?: string;
  };
}

interface SDKMessageForward extends WSMessage {
  type: 'sdk_message';
  operation: 'ingest' | 'query' | 'lint';
  id: string;
  message: any; // SDKMessage
}

interface OperationComplete extends WSMessage {
  type: 'operation_complete';
  operation: 'ingest' | 'query' | 'lint';
  id: string;
  result: string;
  costUsd: number;
  messages: any[];
}

interface OperationError extends WSMessage {
  type: 'operation_error';
  operation: 'ingest' | 'query' | 'lint';
  id: string;
  error: string;
}

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
// 静态文件服务 - 在容器中路径为 /app/public
const publicPath = process.env.NODE_ENV === 'production'
  ? '/app/public'
  : path.join(__dirname, '../../public');

app.use(express.static(publicPath, {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// 创建Wiki服务实例
const wikiService = new WikiServiceV2();

// API路由

// 获取/设置wiki根目录
app.get('/api/wiki/root', (req, res) => {
  res.json({ root: (wikiService as any).wikiRoot });
});

app.post('/api/wiki/root', (req, res) => {
  const { root } = req.body;
  if (!root || typeof root !== 'string') {
    return res.status(400).json({ error: 'root参数必须为字符串' });
  }

  try {
    wikiService.setWikiRoot(root);
    res.json({ success: true, root });
  } catch (error) {
    res.status(500).json({ error: `设置根目录失败: ${error instanceof Error ? error.message : String(error)}` });
  }
});

// 浏览目录
app.get('/api/fs/list', async (req, res) => {
  try {
    const dirPath = req.query.path as string;
    const result = await wikiService.listDirectory(dirPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: `目录浏览失败: ${error instanceof Error ? error.message : String(error)}` });
  }
});

// 读取文件
app.get('/api/fs/read', async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'path参数必填' });
    }

    const content = await wikiService.readFile(filePath);
    res.json({ content, path: filePath });
  } catch (error) {
    res.status(500).json({ error: `读取文件失败: ${error instanceof Error ? error.message : String(error)}` });
  }
});

// Ingest处理源文件
app.post('/api/wiki/ingest', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'filePath参数必须为字符串' });
    }

    console.log(`开始Ingest处理: ${filePath}`);
    const result = await wikiService.ingestFromPath(filePath);

    res.json({
      success: true,
      result: result.result,
      costUsd: result.costUsd,
      messages: result.messages,
      message: 'Ingest处理完成'
    });
  } catch (error) {
    console.error('Ingest API错误:', error);
    res.status(500).json({
      error: `Ingest处理失败: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Query查询
app.post('/api/wiki/query', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question参数必须为字符串' });
    }

    console.log(`开始Query: ${question.substring(0, 100)}...`);
    const result = await wikiService.query(question);

    res.json({
      success: true,
      result: result.result,
      costUsd: result.costUsd,
      messages: result.messages,
      message: 'Query完成'
    });
  } catch (error) {
    console.error('Query API错误:', error);
    res.status(500).json({
      error: `Query失败: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Lint检查
app.post('/api/wiki/lint', async (req, res) => {
  try {
    console.log('开始Lint检查');
    const result = await wikiService.lint();

    res.json({
      success: true,
      result: result.result,
      costUsd: result.costUsd,
      messages: result.messages,
      message: 'Lint检查完成'
    });
  } catch (error) {
    console.error('Lint API错误:', error);
    res.status(500).json({
      error: `Lint失败: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// 获取wiki状态
app.get('/api/wiki/status', async (req, res) => {
  try {
    const status = await wikiService.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({
      error: `获取状态失败: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// API配置管理
app.get('/api/config', (req, res) => {
  try {
    const config = wikiService.getApiConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ error: '获取配置失败' });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const { apiKey, baseUrl, model } = req.body;
    wikiService.setApiConfig({ apiKey, baseUrl, model });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '更新配置失败' });
  }
});

// 默认路由 - 服务前端（捕获未匹配的请求）
app.use((req, res) => {
  const indexPath = process.env.NODE_ENV === 'production'
    ? '/app/public/index.html'
    : path.join(__dirname, '../../public/index.html');
  res.sendFile(indexPath);
});

// 创建HTTP服务器
const server = createServer(app);

// 创建WebSocket服务器
const wss = new WebSocketServer({ server });

// WebSocket连接管理
const clients = new Map<string, WebSocket>();

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(7);
  console.log(`WebSocket客户端连接: ${clientId}`);

  clients.set(clientId, ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleWebSocketMessage(clientId, message, ws);
    } catch (error) {
      console.error('WebSocket消息解析失败:', error);
      ws.send(JSON.stringify({ type: 'error', message: '消息格式无效' }));
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket客户端断开: ${clientId}`);
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket客户端 ${clientId} 错误:`, error);
  });

  // 发送连接确认
  ws.send(JSON.stringify({ type: 'connected', clientId }));
});

// WebSocket消息处理
function handleWebSocketMessage(clientId: string, message: any, ws: WebSocket) {
  console.log(`收到WebSocket消息 ${clientId}:`, message.type);

  if (message.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
    return;
  }

  // 处理操作请求
  if (message.type === 'operation_request') {
    const request = message as OperationRequest;
    console.log(`开始处理${request.operation}操作:`, request.id);

    // 发送开始确认
    ws.send(JSON.stringify({
      type: 'operation_started',
      operation: request.operation,
      id: request.id,
      timestamp: Date.now()
    }));

    // 根据操作类型调用不同的流式方法
    switch (request.operation) {
      case 'ingest':
        handleIngestStream(request, ws);
        break;
      case 'query':
        handleQueryStream(request, ws);
        break;
      case 'lint':
        handleLintStream(request, ws);
        break;
      default:
        ws.send(JSON.stringify({
          type: 'operation_error',
          operation: request.operation,
          id: request.id,
          error: `未知操作类型: ${request.operation}`
        }));
    }
    return;
  }
}

// 处理Ingest流式操作
async function handleIngestStream(request: OperationRequest, ws: WebSocket) {
  const { operation, id, data } = request;

  if (!data.filePath) {
    ws.send(JSON.stringify({
      type: 'operation_error',
      operation,
      id,
      error: 'filePath参数必填'
    }));
    return;
  }

  try {
    const { result, costUsd } = await wikiService.ingestStream(data.filePath, (msg) => {
      // 转发SDK消息
      const forwardMsg: SDKMessageForward = {
        type: 'sdk_message',
        operation,
        id,
        message: msg
      };
      ws.send(JSON.stringify(forwardMsg));
    });

    // 发送完成消息
    const completeMsg: OperationComplete = {
      type: 'operation_complete',
      operation,
      id,
      result,
      costUsd,
      messages: [] // 如果需要可以收集所有消息
    };
    ws.send(JSON.stringify(completeMsg));

  } catch (error) {
    console.error(`${operation}流式处理失败:`, error);
    const errorMsg: OperationError = {
      type: 'operation_error',
      operation,
      id,
      error: error instanceof Error ? error.message : String(error)
    };
    ws.send(JSON.stringify(errorMsg));
  }
}

// 处理Query流式操作
async function handleQueryStream(request: OperationRequest, ws: WebSocket) {
  const { operation, id, data } = request;

  if (!data.question) {
    ws.send(JSON.stringify({
      type: 'operation_error',
      operation,
      id,
      error: 'question参数必填'
    }));
    return;
  }

  try {
    const { result, costUsd } = await wikiService.queryStream(data.question, (msg) => {
      // 转发SDK消息
      const forwardMsg: SDKMessageForward = {
        type: 'sdk_message',
        operation,
        id,
        message: msg
      };
      ws.send(JSON.stringify(forwardMsg));
    });

    // 发送完成消息
    const completeMsg: OperationComplete = {
      type: 'operation_complete',
      operation,
      id,
      result,
      costUsd,
      messages: []
    };
    ws.send(JSON.stringify(completeMsg));

  } catch (error) {
    console.error(`${operation}流式处理失败:`, error);
    const errorMsg: OperationError = {
      type: 'operation_error',
      operation,
      id,
      error: error instanceof Error ? error.message : String(error)
    };
    ws.send(JSON.stringify(errorMsg));
  }
}

// 处理Lint流式操作
async function handleLintStream(request: OperationRequest, ws: WebSocket) {
  const { operation, id } = request;

  try {
    const { result, costUsd } = await wikiService.lintStream((msg) => {
      // 转发SDK消息
      const forwardMsg: SDKMessageForward = {
        type: 'sdk_message',
        operation,
        id,
        message: msg
      };
      ws.send(JSON.stringify(forwardMsg));
    });

    // 发送完成消息
    const completeMsg: OperationComplete = {
      type: 'operation_complete',
      operation,
      id,
      result,
      costUsd,
      messages: []
    };
    ws.send(JSON.stringify(completeMsg));

  } catch (error) {
    console.error(`${operation}流式处理失败:`, error);
    const errorMsg: OperationError = {
      type: 'operation_error',
      operation,
      id,
      error: error instanceof Error ? error.message : String(error)
    };
    ws.send(JSON.stringify(errorMsg));
  }
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`LLM Wiki服务器运行在 http://localhost:${PORT}`);
  console.log(`WebSocket服务器运行在 ws://localhost:${PORT}`);
  console.log(`Wiki根目录: ${(wikiService as any).wikiRoot}`);
});

export default app;