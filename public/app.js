// LLM Wiki前端应用
class LLMWikiApp {
    constructor() {
        this.apiBase = '/api';
        this.currentPath = '/root/LLM_Wiki/llm-wiki-app/wiki-data';
        this.isProcessing = false;
        this.messages = [];
        this.messageCount = 0;
        this.messagesVisible = true;

        // WebSocket连接
        this.ws = null;
        this.wsConnected = false;
        this.wsReconnectAttempts = 0;
        this.maxWsReconnectAttempts = 5;
        this.pendingOperations = new Map(); // operationId -> callback

        this.init();
    }

    async init() {
        // 初始化UI事件
        this.initEventListeners();

        // 初始化WebSocket连接
        this.initWebSocket();

        // 加载初始状态
        await this.loadWikiRoot();
        await this.loadWikiStatus();
        await this.browseDirectory(this.currentPath);
        await this.loadLogContent();

        // 更新服务器状态
        this.updateServerStatus('已连接');

        // 初始化API配置
        await this.initApiConfig();
    }

    // 初始化WebSocket连接
    initWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;

        console.log('正在连接WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket连接已建立');
            this.wsConnected = true;
            this.wsReconnectAttempts = 0;
            this.addMessage('system', 'WebSocket连接已建立');
            this.updateServerStatus('WebSocket已连接');
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('WebSocket消息解析失败:', error, event.data);
            }
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket连接关闭:', event.code, event.reason);
            this.wsConnected = false;
            this.ws = null;

            this.addMessage('system', `WebSocket连接断开: ${event.code} ${event.reason || ''}`);
            this.updateServerStatus('WebSocket断开');

            // 尝试重连
            if (this.wsReconnectAttempts < this.maxWsReconnectAttempts) {
                this.wsReconnectAttempts++;
                const delay = Math.min(1000 * this.wsReconnectAttempts, 10000);
                console.log(`将在${delay}ms后重连WebSocket (尝试 ${this.wsReconnectAttempts}/${this.maxWsReconnectAttempts})`);

                setTimeout(() => {
                    if (!this.wsConnected) {
                        this.initWebSocket();
                    }
                }, delay);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
            this.addMessage('error', 'WebSocket连接错误');
            this.updateServerStatus('WebSocket错误');
        };
    }

    // 处理WebSocket消息
    handleWebSocketMessage(message) {
        console.log('收到WebSocket消息:', message.type);

        switch (message.type) {
            case 'connected':
                console.log('WebSocket连接确认，客户端ID:', message.clientId);
                this.clientId = message.clientId;
                break;

            case 'operation_started':
                this.addMessage('system', `开始${message.operation}操作`);
                break;

            case 'sdk_message':
                // 处理SDK消息
                const processedMsg = this.processSDKMessage(message.message);
                this.addMessage(processedMsg.type, processedMsg.content, processedMsg.metadata);
                break;

            case 'operation_complete':
                this.showResult(`${message.operation}完成`, message.result);
                document.getElementById('costBadge').textContent = `成本: $${message.costUsd.toFixed(4)}`;
                document.getElementById('costBadge').style.display = 'inline-block';
                this.addMessage('success', `${message.operation}操作完成，成本: $${message.costUsd.toFixed(4)}`);

                // 完成特定操作后的处理
                if (message.operation === 'ingest') {
                    // 刷新状态和目录
                    this.loadWikiStatus();
                    this.browseDirectory(this.currentPath);
                    this.loadLogContent();
                }

                // 清除处理状态
                this.isProcessing = false;
                const btn = this.getOperationButton(message.operation);
                if (btn) this.hideLoading(btn);
                break;

            case 'operation_error':
                this.addMessage('error', `${message.operation}错误: ${message.error}`);
                this.showResult(`${message.operation}失败`, `错误: ${message.error}`);

                // 清除处理状态
                this.isProcessing = false;
                const errorBtn = this.getOperationButton(message.operation);
                if (errorBtn) this.hideLoading(errorBtn);
                break;

            case 'pong':
                // 心跳响应，忽略
                break;

            default:
                console.log('未知WebSocket消息类型:', message.type, message);
        }
    }

    // 获取操作对应的按钮
    getOperationButton(operation) {
        switch (operation) {
            case 'ingest': return document.getElementById('ingestBtn');
            case 'query': return document.getElementById('queryBtn');
            case 'lint': return document.getElementById('lintBtn');
            default: return null;
        }
    }

    // 通过WebSocket发送操作请求
    sendWebSocketOperation(operation, data) {
        if (!this.wsConnected || !this.ws) {
            this.showMessage('error', 'WebSocket未连接，无法执行操作');
            return null;
        }

        const operationId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const request = {
            type: 'operation_request',
            operation,
            id: operationId,
            data
        };

        this.ws.send(JSON.stringify(request));
        console.log(`已发送${operation}操作请求:`, operationId);

        return operationId;
    }

    // SDK消息处理
    processSDKMessage(sdkMsg) {
        // 根据SDK消息类型转换为前端消息格式
        const baseMessage = {
            timestamp: new Date().toLocaleTimeString(),
            metadata: {}
        };

        switch (sdkMsg.type) {
            case 'assistant':
                return {
                    ...baseMessage,
                    type: 'assistant',
                    content: this.extractAssistantContent(sdkMsg.message?.content),
                    metadata: {
                        tokens: sdkMsg.message?.usage ? {
                            input: sdkMsg.message.usage.input_tokens,
                            output: sdkMsg.message.usage.output_tokens
                        } : undefined
                    }
                };

            case 'tool_progress':
                return {
                    ...baseMessage,
                    type: 'tool',
                    content: `工具执行: ${sdkMsg.tool_name}`,
                    metadata: {
                        toolName: sdkMsg.tool_name,
                        elapsedTime: sdkMsg.elapsed_time_seconds
                    }
                };

            case 'system':
                if (sdkMsg.subtype === 'task_started') {
                    return {
                        ...baseMessage,
                        type: 'system',
                        content: `子智能体启动: ${sdkMsg.description}`
                    };
                }
                if (sdkMsg.subtype === 'task_progress') {
                    return {
                        ...baseMessage,
                        type: 'progress',
                        content: `任务进度: ${sdkMsg.description}`
                    };
                }
                if (sdkMsg.subtype === 'task_notification') {
                    return {
                        ...baseMessage,
                        type: sdkMsg.status === 'completed' ? 'success' : 'error',
                        content: `任务完成: ${sdkMsg.summary}`
                    };
                }
                return {
                    ...baseMessage,
                    type: 'system',
                    content: sdkMsg.subtype || '系统消息'
                };

            case 'result':
                return {
                    ...baseMessage,
                    type: 'success',
                    content: `操作完成: ${sdkMsg.result ? '成功' : '失败'}`,
                    metadata: {
                        costUsd: sdkMsg.total_cost_usd
                    }
                };

            default:
                return {
                    ...baseMessage,
                    type: 'system',
                    content: `消息类型: ${sdkMsg.type}`,
                    metadata: { raw: sdkMsg }
                };
        }
    }

    extractAssistantContent(content) {
        if (!content) return '无内容';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            // 提取文本内容
            const texts = content.filter(item => item.type === 'text').map(item => item.text);
            return texts.join('\n');
        }
        return JSON.stringify(content);
    }

    addMessage(type, content, metadata = {}) {
        const messageId = ++this.messageCount;
        const message = {
            id: messageId,
            type,
            content,
            timestamp: new Date().toLocaleTimeString(),
            metadata
        };

        this.messages.push(message);
        this.renderMessage(message);
        this.updateMessageCounter();

        // 自动滚动到底部
        const messagesList = document.getElementById('messagesList');
        if (messagesList) {
            messagesList.scrollTop = messagesList.scrollHeight;
        }

        return messageId;
    }

    renderMessage(message) {
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;

        // 确保消息列表可见
        const placeholder = document.getElementById('messagesPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
        messagesList.style.display = 'block';

        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${message.type}`;
        messageElement.id = `message-${message.id}`;

        // 消息头部：类型和时间
        const typeLabels = {
            'system': '系统',
            'assistant': '助手',
            'tool': '工具',
            'progress': '进度',
            'error': '错误',
            'success': '成功'
        };
        const typeLabel = typeLabels[message.type] || message.type;

        const headerHtml = `
            <div class="message-header">
                <span class="message-type ${message.type}">${typeLabel}</span>
                <span class="message-time">${message.timestamp}</span>
            </div>
        `;

        // 消息内容
        let contentHtml = '';
        if (typeof message.content === 'string') {
            // 简单文本内容
            contentHtml = `<div class="message-content">${this.escapeHtml(message.content)}</div>`;
        } else {
            // 复杂对象内容
            contentHtml = `<div class="message-content"><pre>${this.escapeHtml(JSON.stringify(message.content, null, 2))}</pre></div>`;
        }

        // 工具信息（如果有）
        let toolInfoHtml = '';
        if (message.metadata.toolName) {
            toolInfoHtml = `
                <div class="message-tool-info">
                    <span class="message-tool-name">工具: ${message.metadata.toolName}</span>
                    ${message.metadata.elapsedTime ? `<span class="message-tool-time">耗时: ${message.metadata.elapsedTime}s</span>` : ''}
                </div>
            `;
        }

        // Token使用信息（如果有）
        let tokenInfoHtml = '';
        if (message.metadata.tokens) {
            tokenInfoHtml = `
                <div class="message-token-usage">
                    Token使用: 输入 ${message.metadata.tokens.input || 0}, 输出 ${message.metadata.tokens.output || 0}
                </div>
            `;
        }

        messageElement.innerHTML = headerHtml + contentHtml + toolInfoHtml + tokenInfoHtml;
        messagesList.appendChild(messageElement);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateMessageCounter() {
        const counter = document.getElementById('messageCounter');
        if (counter) {
            counter.textContent = `消息: ${this.messageCount}`;
        }
    }

    clearMessages() {
        this.messages = [];
        this.messageCount = 0;

        const messagesList = document.getElementById('messagesList');
        if (messagesList) {
            messagesList.innerHTML = '';
            messagesList.style.display = 'none';
        }

        const placeholder = document.getElementById('messagesPlaceholder');
        if (placeholder) {
            placeholder.style.display = 'block';
        }

        this.updateMessageCounter();
        this.addMessage('system', '消息历史已清空');
    }

    toggleMessages() {
        const messagesSection = document.querySelector('.messages-section');
        if (messagesSection) {
            messagesSection.classList.toggle('collapsed');
            const btn = document.getElementById('toggleMessagesBtn');
            const icon = btn.querySelector('i');
            if (messagesSection.classList.contains('collapsed')) {
                icon.className = 'fas fa-eye-slash';
                btn.innerHTML = '<i class="fas fa-eye-slash"></i> 显示/隐藏';
            } else {
                icon.className = 'fas fa-eye';
                btn.innerHTML = '<i class="fas fa-eye"></i> 显示/隐藏';
            }
        }
    }

    initEventListeners() {
        // 选项卡切换
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Wiki根目录设置
        document.getElementById('setRootBtn').addEventListener('click', () => this.setWikiRoot());

        // 状态刷新
        document.getElementById('refreshStatusBtn').addEventListener('click', () => this.loadWikiStatus());

        // 文件浏览
        document.getElementById('browseBtn').addEventListener('click', () => {
            const path = document.getElementById('browserPath').value;
            this.browseDirectory(path);
        });

        document.getElementById('browserPath').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const path = document.getElementById('browserPath').value;
                this.browseDirectory(path);
            }
        });

        // Ingest相关
        document.getElementById('filePath').addEventListener('input', (e) => {
            if (e.target.value) {
                this.previewFile(e.target.value);
            }
        });

        document.getElementById('browseFileBtn').addEventListener('click', () => {
            this.selectFileForIngest();
        });

        document.getElementById('ingestBtn').addEventListener('click', () => this.performIngest());

        // Query相关
        document.getElementById('queryBtn').addEventListener('click', () => this.performQuery());

        document.getElementById('questionInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.performQuery();
            }
        });

        // Lint相关
        document.getElementById('lintBtn').addEventListener('click', () => this.performLint());

        // 日志相关
        document.getElementById('refreshLogBtn').addEventListener('click', () => this.loadLogContent());

        // API配置相关
        document.getElementById('loadConfigBtn').addEventListener('click', () => this.loadApiConfig());
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveApiConfig());

        // 消息面板控制
        document.getElementById('clearMessagesBtn').addEventListener('click', () => this.clearMessages());
        document.getElementById('toggleMessagesBtn').addEventListener('click', () => this.toggleMessages());
    }

    // UI辅助方法
    showLoading(element) {
        element.classList.add('loading');
        element.disabled = true;
    }

    hideLoading(element) {
        element.classList.remove('loading');
        element.disabled = false;
    }

    showMessage(type, message, containerId = 'resultOutput') {
        const container = document.getElementById(containerId);
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message`;
        messageDiv.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
        container.prepend(messageDiv);

        // 自动移除消息
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }

    // 消息面板方法
    addMessage(type, content, metadata = {}) {
        const timestamp = new Date().toLocaleTimeString();
        const messageId = ++this.messageCount;
        const message = {
            id: messageId,
            type,
            content,
            timestamp,
            metadata
        };

        this.messages.push(message);
        this.renderMessage(message);
        this.updateMessageCounter();

        // 自动滚动到底部
        const messagesList = document.getElementById('messagesList');
        if (messagesList) {
            messagesList.scrollTop = messagesList.scrollHeight;
        }

        return messageId;
    }

    renderMessage(message) {
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;

        // 确保消息列表可见
        const placeholder = document.getElementById('messagesPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
        messagesList.style.display = 'block';

        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${message.type}`;
        messageElement.id = `message-${message.id}`;

        // 消息头部：类型和时间
        const typeLabel = this.getMessageTypeLabel(message.type);
        const headerHtml = `
            <div class="message-header">
                <span class="message-type ${message.type}">${typeLabel}</span>
                <span class="message-time">${message.timestamp}</span>
            </div>
        `;

        // 消息内容
        let contentHtml = '';
        if (typeof message.content === 'string') {
            // 简单文本内容
            contentHtml = `<div class="message-content">${this.escapeHtml(message.content)}</div>`;
        } else if (message.content && typeof message.content === 'object') {
            // 复杂对象内容
            contentHtml = `<div class="message-content"><pre>${this.escapeHtml(JSON.stringify(message.content, null, 2))}</pre></div>`;
        }

        // 工具信息（如果有）
        let toolInfoHtml = '';
        if (message.metadata.toolName) {
            toolInfoHtml = `
                <div class="message-tool-info">
                    <span class="message-tool-name">工具: ${message.metadata.toolName}</span>
                    ${message.metadata.elapsedTime ? `<span class="message-tool-time">耗时: ${message.metadata.elapsedTime}s</span>` : ''}
                </div>
            `;
        }

        // Token使用信息（如果有）
        let tokenInfoHtml = '';
        if (message.metadata.tokens) {
            tokenInfoHtml = `
                <div class="message-token-usage">
                    Token使用: 输入 ${message.metadata.tokens.input || 0}, 输出 ${message.metadata.tokens.output || 0}
                </div>
            `;
        }

        messageElement.innerHTML = headerHtml + contentHtml + toolInfoHtml + tokenInfoHtml;
        messagesList.appendChild(messageElement);
    }

    getMessageTypeLabel(type) {
        const labels = {
            'system': '系统',
            'assistant': '助手',
            'tool': '工具',
            'progress': '进度',
            'error': '错误',
            'success': '成功'
        };
        return labels[type] || type;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateMessageCounter() {
        const counter = document.getElementById('messageCounter');
        if (counter) {
            counter.textContent = `消息: ${this.messageCount}`;
        }
    }

    clearMessages() {
        this.messages = [];
        this.messageCount = 0;

        const messagesList = document.getElementById('messagesList');
        if (messagesList) {
            messagesList.innerHTML = '';
            messagesList.style.display = 'none';
        }

        const placeholder = document.getElementById('messagesPlaceholder');
        if (placeholder) {
            placeholder.style.display = 'block';
        }

        this.updateMessageCounter();
        this.addMessage('system', '消息历史已清空');
    }

    toggleMessages() {
        const messagesSection = document.querySelector('.messages-section');
        if (messagesSection) {
            messagesSection.classList.toggle('collapsed');
            const btn = document.getElementById('toggleMessagesBtn');
            const icon = btn.querySelector('i');
            if (messagesSection.classList.contains('collapsed')) {
                icon.className = 'fas fa-eye-slash';
                btn.innerHTML = '<i class="fas fa-eye-slash"></i> 显示/隐藏';
            } else {
                icon.className = 'fas fa-eye';
                btn.innerHTML = '<i class="fas fa-eye"></i> 显示/隐藏';
            }
        }
    }

    // 辅助方法：添加模拟进度消息
    addMockProgressMessages(operation) {
        const operations = {
            'ingest': {
                name: 'Ingest处理',
                steps: [
                    { delay: 500, type: 'system', content: '开始处理源文件...' },
                    { delay: 1000, type: 'progress', content: '读取源文件内容', metadata: { toolName: 'Read' } },
                    { delay: 1500, type: 'progress', content: '分析文件内容，识别关键信息' },
                    { delay: 2000, type: 'assistant', content: '正在理解文档结构和主要内容...' },
                    { delay: 2500, type: 'progress', content: '更新wiki页面', metadata: { toolName: 'Write' } },
                    { delay: 3000, type: 'progress', content: '更新索引文件', metadata: { toolName: 'Edit' } },
                    { delay: 3500, type: 'progress', content: '更新日志记录', metadata: { toolName: 'Edit' } },
                    { delay: 4000, type: 'system', content: '处理完成，验证一致性...' }
                ]
            },
            'query': {
                name: '查询处理',
                steps: [
                    { delay: 500, type: 'system', content: '开始查询处理...' },
                    { delay: 1000, type: 'progress', content: '搜索相关wiki页面', metadata: { toolName: 'Glob' } },
                    { delay: 1500, type: 'progress', content: '读取索引文件', metadata: { toolName: 'Read' } },
                    { delay: 2000, type: 'assistant', content: '正在分析查询意图，准备搜索策略...' },
                    { delay: 2500, type: 'progress', content: '读取相关页面内容', metadata: { toolName: 'Read' } },
                    { delay: 3000, type: 'assistant', content: '综合信息，生成答案...' },
                    { delay: 3500, type: 'system', content: '答案生成完成，正在格式化...' }
                ]
            },
            'lint': {
                name: 'Lint检查',
                steps: [
                    { delay: 500, type: 'system', content: '开始wiki健康检查...' },
                    { delay: 1000, type: 'progress', content: '扫描wiki目录结构', metadata: { toolName: 'Glob' } },
                    { delay: 1500, type: 'progress', content: '检查页面间链接关系', metadata: { toolName: 'Grep' } },
                    { delay: 2000, type: 'assistant', content: '正在分析wiki一致性，检测潜在问题...' },
                    { delay: 2500, type: 'progress', content: '检查过时信息', metadata: { toolName: 'Read' } },
                    { delay: 3000, type: 'progress', content: '识别孤立页面', metadata: { toolName: 'Grep' } },
                    { delay: 3500, type: 'assistant', content: '生成健康检查报告...' },
                    { delay: 4000, type: 'system', content: '检查完成，生成建议...' }
                ]
            }
        };

        const op = operations[operation];
        if (!op) return;

        this.addMessage('system', `开始${op.name}...`);

        op.steps.forEach(step => {
            setTimeout(() => {
                this.addMessage(step.type, step.content, step.metadata || {});
            }, step.delay);
        });

        return op.steps.length;
    }

    switchTab(tabName) {
        // 更新选项卡
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');

        // 更新内容
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // 如果是日志选项卡，刷新内容
        if (tabName === 'logs') {
            this.loadLogContent();
        }
    }

    // API调用方法
    async apiCall(endpoint, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const config = { ...defaultOptions, ...options };

        if (config.body && typeof config.body !== 'string') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, config);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API调用失败 ${endpoint}:`, error);
            throw error;
        }
    }

    // Wiki根目录操作
    async loadWikiRoot() {
        try {
            const data = await this.apiCall('/wiki/root');
            this.currentPath = data.root;
            document.getElementById('currentRoot').textContent = data.root;
            document.getElementById('browserPath').value = data.root;
        } catch (error) {
            console.error('加载wiki根目录失败:', error);
        }
    }

    async setWikiRoot() {
        const rootInput = document.getElementById('wikiRootInput');
        const rootPath = rootInput.value.trim();

        if (!rootPath) {
            this.showMessage('error', '请输入wiki根目录路径');
            return;
        }

        const btn = document.getElementById('setRootBtn');
        this.showLoading(btn);

        try {
            const data = await this.apiCall('/wiki/root', {
                method: 'POST',
                body: { root: rootPath }
            });

            if (data.success) {
                this.currentPath = rootPath;
                document.getElementById('currentRoot').textContent = rootPath;
                document.getElementById('browserPath').value = rootPath;
                rootInput.value = '';

                this.showMessage('success', `Wiki根目录已设置为: ${rootPath}`);
                await this.loadWikiStatus();
                await this.browseDirectory(rootPath);
            }
        } catch (error) {
            this.showMessage('error', `设置根目录失败: ${error.message}`);
        } finally {
            this.hideLoading(btn);
        }
    }

    // 状态管理
    async loadWikiStatus() {
        try {
            const data = await this.apiCall('/wiki/status');

            if (data.success) {
                document.getElementById('statusRawFiles').textContent = data.rawFiles;
                document.getElementById('statusWikiPages').textContent = data.wikiPages;
                document.getElementById('statusLogEntries').textContent = data.logEntries;
                document.getElementById('statusIndexSize').textContent = `${data.indexSize} 字符`;

                // 更新当前路径
                this.currentPath = data.wikiRoot;
                document.getElementById('currentRoot').textContent = data.wikiRoot;
            }
        } catch (error) {
            console.error('加载wiki状态失败:', error);
        }
    }

    // 文件浏览
    async browseDirectory(path) {
        try {
            const data = await this.apiCall(`/fs/list?path=${encodeURIComponent(path)}`);

            // 更新路径输入框
            document.getElementById('browserPath').value = path;

            // 显示目录
            const dirsList = document.getElementById('directoriesList');
            dirsList.innerHTML = '<h3><i class="fas fa-folder"></i> 目录</h3>';

            if (data.directories.length > 0) {
                data.directories.forEach(dir => {
                    const dirElement = document.createElement('div');
                    dirElement.className = 'dir-item';
                    dirElement.innerHTML = `<i class="fas fa-folder"></i> ${dir}`;
                    dirElement.addEventListener('click', () => {
                        const newPath = path.endsWith('/') ? `${path}${dir}` : `${path}/${dir}`;
                        this.browseDirectory(newPath);
                    });
                    dirsList.appendChild(dirElement);
                });
            } else {
                dirsList.innerHTML += '<p style="color: #999; padding: 10px;">无子目录</p>';
            }

            // 显示文件
            const filesList = document.getElementById('filesList');
            filesList.innerHTML = '<h3><i class="fas fa-file"></i> 文件</h3>';

            if (data.files.length > 0) {
                data.files.forEach(file => {
                    const fileElement = document.createElement('div');
                    fileElement.className = 'file-item';
                    fileElement.innerHTML = `<i class="fas fa-file"></i> ${file}`;
                    fileElement.addEventListener('click', () => {
                        const filePath = path.endsWith('/') ? `${path}${file}` : `${path}/${file}`;
                        document.getElementById('filePath').value = filePath;
                        this.previewFile(filePath);
                        this.switchTab('ingest');
                    });
                    filesList.appendChild(fileElement);
                });
            } else {
                filesList.innerHTML += '<p style="color: #999; padding: 10px;">无文件</p>';
            }
        } catch (error) {
            console.error('浏览目录失败:', error);
            this.showMessage('error', `浏览目录失败: ${error.message}`);
        }
    }

    async previewFile(filePath) {
        try {
            const data = await this.apiCall(`/fs/read?path=${encodeURIComponent(filePath)}`);
            const preview = document.getElementById('filePreview');

            // 限制预览长度
            const maxLength = 2000;
            let content = data.content;

            if (content.length > maxLength) {
                content = content.substring(0, maxLength) + `\n\n...（已截断，完整文件 ${content.length} 字符）`;
            }

            preview.textContent = content;
        } catch (error) {
            console.error('预览文件失败:', error);
            document.getElementById('filePreview').textContent = `无法读取文件: ${error.message}`;
        }
    }

    selectFileForIngest() {
        // 由于安全限制，不能直接使用文件选择器选择任意路径
        // 引导用户通过文件浏览器选择或手动输入
        this.switchTab('ingest');
        this.showMessage('info', '请通过左侧文件浏览器选择文件，或手动输入文件路径');
    }

    // 操作执行
    async performIngest() {
        if (this.isProcessing) return;

        const filePath = document.getElementById('filePath').value.trim();
        if (!filePath) {
            this.showMessage('error', '请输入文件路径');
            return;
        }

        this.isProcessing = true;
        const btn = document.getElementById('ingestBtn');
        this.showLoading(btn);

        // 清空之前的消息
        this.clearMessages();
        this.addMessage('system', `开始Ingest处理: ${filePath}`);

        this.showResult('Ingest处理中...', '正在处理源文件，请稍候...');

        // 使用WebSocket发送请求
        const operationId = this.sendWebSocketOperation('ingest', { filePath });

        if (!operationId) {
            this.isProcessing = false;
            this.hideLoading(btn);
            this.showMessage('error', '无法建立WebSocket连接，请刷新页面重试');
        }
        // 操作结果将通过WebSocket消息处理
    }

    async performQuery() {
        if (this.isProcessing) return;

        const question = document.getElementById('questionInput').value.trim();
        if (!question) {
            this.showMessage('error', '请输入问题');
            return;
        }

        this.isProcessing = true;
        const btn = document.getElementById('queryBtn');
        this.showLoading(btn);

        // 清空之前的消息
        this.clearMessages();
        this.addMessage('system', `开始查询: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`);

        this.showResult('查询中...', '正在搜索wiki并生成答案，请稍候...');

        // 使用WebSocket发送请求
        const operationId = this.sendWebSocketOperation('query', { question });

        if (!operationId) {
            this.isProcessing = false;
            this.hideLoading(btn);
            this.showMessage('error', '无法建立WebSocket连接，请刷新页面重试');
        }
        // 操作结果将通过WebSocket消息处理
    }

    async performLint() {
        if (this.isProcessing) return;

        this.isProcessing = true;
        const btn = document.getElementById('lintBtn');
        this.showLoading(btn);

        // 清空之前的消息
        this.clearMessages();
        this.addMessage('system', '开始Lint检查');

        this.showResult('Lint检查中...', '正在检查wiki健康度，请稍候...');

        // 使用WebSocket发送请求
        const operationId = this.sendWebSocketOperation('lint', {});

        if (!operationId) {
            this.isProcessing = false;
            this.hideLoading(btn);
            this.showMessage('error', '无法建立WebSocket连接，请刷新页面重试');
        }
        // 操作结果将通过WebSocket消息处理
    }

    async loadLogContent() {
        try {
            const logPath = this.currentPath.endsWith('/') ?
                `${this.currentPath}log.md` : `${this.currentPath}/log.md`;

            const data = await this.apiCall(`/fs/read?path=${encodeURIComponent(logPath)}`);
            document.getElementById('logContent').textContent = data.content;
        } catch (error) {
            console.error('加载日志失败:', error);
            document.getElementById('logContent').textContent = `无法读取日志: ${error.message}`;
        }
    }

    // 结果显示
    showResult(title, content) {
        document.getElementById('resultTitle').textContent = title;

        const resultOutput = document.getElementById('resultOutput');

        // 简单Markdown渲染
        let htmlContent = content;

        // 转换标题
        htmlContent = htmlContent.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        htmlContent = htmlContent.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        htmlContent = htmlContent.replace(/^### (.*$)/gm, '<h3>$1</h3>');

        // 转换列表
        htmlContent = htmlContent.replace(/^\* (.*$)/gm, '<li>$1</li>');
        htmlContent = htmlContent.replace(/^- (.*$)/gm, '<li>$1</li>');
        htmlContent = htmlContent.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');

        // 转换代码块
        htmlContent = htmlContent.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // 转换内联代码
        htmlContent = htmlContent.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 转换粗体
        htmlContent = htmlContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // 转换斜体
        htmlContent = htmlContent.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 转换链接
        htmlContent = htmlContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // 转换段落
        const lines = htmlContent.split('\n');
        const processedLines = [];
        let currentParagraph = '';

        for (const line of lines) {
            if (line.trim() === '') {
                if (currentParagraph) {
                    processedLines.push(`<p>${currentParagraph}</p>`);
                    currentParagraph = '';
                }
                processedLines.push('<br>');
            } else if (line.startsWith('<') && line.endsWith('>')) {
                // 已经是HTML标签
                if (currentParagraph) {
                    processedLines.push(`<p>${currentParagraph}</p>`);
                    currentParagraph = '';
                }
                processedLines.push(line);
            } else {
                currentParagraph += (currentParagraph ? ' ' : '') + line;
            }
        }

        if (currentParagraph) {
            processedLines.push(`<p>${currentParagraph}</p>`);
        }

        resultOutput.innerHTML = processedLines.join('\n');
    }

    updateServerStatus(status) {
        const statusElement = document.getElementById('serverStatus');
        statusElement.textContent = status;

        if (status === '已连接') {
            statusElement.style.color = '#27ae60';
        } else if (status.includes('错误')) {
            statusElement.style.color = '#e74c3c';
        } else {
            statusElement.style.color = '#f39c12';
        }
    }

    // API配置方法
    async loadApiConfig() {
        const loadBtn = document.getElementById('loadConfigBtn');
        this.showLoading(loadBtn);
        const statusElement = document.getElementById('configStatus');

        try {
            // 先从localStorage加载缓存
            const cachedConfig = localStorage.getItem('llm-wiki-api-config');
            if (cachedConfig) {
                const config = JSON.parse(cachedConfig);
                document.getElementById('apiKey').value = config.apiKey || '';
                document.getElementById('baseUrl').value = config.baseUrl || 'https://api.anthropic.com';
                document.getElementById('model').value = config.model || 'claude-3-5-sonnet-20241022';
                statusElement.textContent = '已从缓存加载配置';
                statusElement.style.color = '#27ae60';
            }

            // 然后从服务器加载最新配置
            const data = await this.apiCall('/config');
            if (data.success && data.config) {
                document.getElementById('apiKey').value = data.config.apiKey || '';
                document.getElementById('baseUrl').value = data.config.baseUrl || 'https://api.anthropic.com';
                document.getElementById('model').value = data.config.model || 'claude-3-5-sonnet-20241022';

                // 更新缓存
                localStorage.setItem('llm-wiki-api-config', JSON.stringify(data.config));

                statusElement.textContent = '配置已从服务器加载并缓存';
                statusElement.style.color = '#27ae60';
            } else {
                statusElement.textContent = '服务器配置为空，使用缓存或默认值';
                statusElement.style.color = '#f39c12';
            }
        } catch (error) {
            console.error('加载API配置失败:', error);
            statusElement.textContent = `加载配置失败: ${error.message}`;
            statusElement.style.color = '#e74c3c';
        } finally {
            this.updateUIWithConfig();
            this.hideLoading(loadBtn);
        }
    }

    async saveApiConfig() {
        const saveBtn = document.getElementById('saveConfigBtn');
        this.showLoading(saveBtn);
        const statusElement = document.getElementById('configStatus');

        const apiKey = document.getElementById('apiKey').value.trim();
        const baseUrl = document.getElementById('baseUrl').value.trim();
        const model = document.getElementById('model').value.trim();

        // 基本验证
        if (!apiKey) {
            statusElement.textContent = '错误: API密钥不能为空';
            statusElement.style.color = '#e74c3c';
            this.hideLoading(saveBtn);
            return;
        }

        if (!baseUrl) {
            statusElement.textContent = '错误: 基础URL不能为空';
            statusElement.style.color = '#e74c3c';
            this.hideLoading(saveBtn);
            return;
        }

        try {
            const config = {
                apiKey,
                baseUrl,
                model: model || 'claude-3-5-sonnet-20241022'
            };

            // 保存到服务器
            const data = await this.apiCall('/config', {
                method: 'POST',
                body: config
            });

            if (data.success) {
                // 保存到localStorage
                localStorage.setItem('llm-wiki-api-config', JSON.stringify(config));

                statusElement.textContent = '配置已保存到服务器和本地缓存';
                statusElement.style.color = '#27ae60';
            } else {
                throw new Error('服务器返回失败');
            }
        } catch (error) {
            console.error('保存API配置失败:', error);
            statusElement.textContent = `保存配置失败: ${error.message}`;
            statusElement.style.color = '#e74c3c';
        } finally {
            this.updateUIWithConfig();
            this.hideLoading(saveBtn);
        }
    }

    async initApiConfig() {
        try {
            // 先尝试从localStorage加载
            const cachedConfig = localStorage.getItem('llm-wiki-api-config');
            if (cachedConfig) {
                const config = JSON.parse(cachedConfig);
                document.getElementById('apiKey').value = config.apiKey || '';
                document.getElementById('baseUrl').value = config.baseUrl || 'https://api.anthropic.com';
                document.getElementById('model').value = config.model || 'claude-3-5-sonnet-20241022';
                console.log('从localStorage加载API配置');
            }

            // 然后尝试从服务器加载最新配置
            const data = await this.apiCall('/config');
            if (data.success && data.config) {
                document.getElementById('apiKey').value = data.config.apiKey || '';
                document.getElementById('baseUrl').value = data.config.baseUrl || 'https://api.anthropic.com';
                document.getElementById('model').value = data.config.model || 'claude-3-5-sonnet-20241022';

                // 更新缓存
                localStorage.setItem('llm-wiki-api-config', JSON.stringify(data.config));
                console.log('从服务器加载API配置并更新缓存');
            }
        } catch (error) {
            console.log('初始化API配置失败，使用默认值:', error.message);
            // 使用默认值
            document.getElementById('baseUrl').value = 'https://api.anthropic.com';
            document.getElementById('model').value = 'claude-3-5-sonnet-20241022';
        } finally {
            this.updateUIWithConfig();
        }
    }

    updateUIWithConfig() {
        // 如果需要根据配置状态更新UI（例如禁用按钮），可以在这里实现
        const apiKey = document.getElementById('apiKey').value.trim();
        const baseUrl = document.getElementById('baseUrl').value.trim();

        const hasConfig = apiKey && baseUrl;

        // 可以在这里根据配置状态更新UI元素
        // 例如: document.getElementById('ingestBtn').disabled = !hasConfig;
    }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LLMWikiApp();
});