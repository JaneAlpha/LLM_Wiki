import { query, collectMessages, Options } from '@codrstudio/openclaude-sdk';
import path from 'path';
import fs from 'fs/promises';
import fss from 'fs';

/**
 * LLM Wiki服务 v2 - 支持直接文件路径操作
 */
export class WikiServiceV2 {
  private wikiRoot: string;
  private apiConfig: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };

  constructor(wikiRoot?: string, apiConfig?: { apiKey?: string; baseUrl?: string; model?: string }) {
    // 配置优先顺序：构造函数参数 > 环境变量 > 默认值
    // 默认使用项目目录下的 wiki-data（上一级目录）
    // 使用更健壮的路径检测：尝试从当前文件位置找到项目根目录
    const projectRoot = path.join(__dirname, '..', '..'); // server/src -> server -> project root
    const defaultWikiRoot = path.join(projectRoot, 'wiki-data');

    this.wikiRoot = wikiRoot || process.env.WIKI_ROOT || defaultWikiRoot;

    // 确保wiki-data目录存在
    this.ensureWikiDirectory();

    // API配置，优先使用传入的配置，其次环境变量，最后默认值
    this.apiConfig = {
      apiKey: apiConfig?.apiKey || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
      baseUrl: apiConfig?.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      model: apiConfig?.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
    };
  }

  /**
   * 设置wiki根目录
   */
  setWikiRoot(rootPath: string) {
    this.wikiRoot = rootPath;
    this.ensureWikiDirectory();
  }

  /**
   * 确保wiki目录结构存在
   */
  private ensureWikiDirectory() {
    try {
      // 创建wiki根目录
      fss.mkdirSync(this.wikiRoot, { recursive: true });

      // 创建必要的子目录
      const rawDir = path.join(this.wikiRoot, 'raw');
      const wikiDir = path.join(this.wikiRoot, 'wiki');

      fss.mkdirSync(rawDir, { recursive: true });
      fss.mkdirSync(wikiDir, { recursive: true });

      // 创建必要的默认文件
      const logPath = path.join(this.wikiRoot, 'log.md');
      const indexPath = path.join(this.wikiRoot, 'index.md');

      if (!fss.existsSync(logPath)) {
        fss.writeFileSync(logPath, '# LLM Wiki Log\n\n' +
          '| 时间 | 操作 | 文件 | 备注 |\n' +
          '|------|------|------|------|\n' +
          '| ' + new Date().toISOString() + ' | 初始化 | - | Wiki系统初始化 |\n');
      }

      if (!fss.existsSync(indexPath)) {
        fss.writeFileSync(indexPath, '# LLM Wiki Index\n\n' +
          '## 页面列表\n\n' +
          '### 待分类\n\n' +
          '（暂无页面）\n');
      }

      console.log(`Wiki目录已初始化: ${this.wikiRoot}`);
    } catch (error) {
      console.error(`无法创建wiki目录 ${this.wikiRoot}:`, error);
    }
  }

  /**
   * 设置API配置
   */
  setApiConfig(apiConfig: { apiKey?: string; baseUrl?: string; model?: string }) {
    if (apiConfig.apiKey !== undefined) {
      this.apiConfig.apiKey = apiConfig.apiKey;
    }
    if (apiConfig.baseUrl !== undefined) {
      this.apiConfig.baseUrl = apiConfig.baseUrl;
    }
    if (apiConfig.model !== undefined) {
      this.apiConfig.model = apiConfig.model;
    }
  }

  /**
   * 获取当前API配置
   */
  getApiConfig() {
    return { ...this.apiConfig };
  }

  /**
   * 获取OpenClaude可执行文件路径
   */
  private getOpenClaudeExecutablePath(): string | undefined {
    // 优先使用环境变量配置
    if (process.env.OPENCLAUDE_EXECUTABLE_PATH) {
      return process.env.OPENCLAUDE_EXECUTABLE_PATH;
    }

    // 如果在当前项目目录下存在openclaude，则使用它（开发环境）
    const projectOpenClaudePath = path.join(__dirname, '../../../openclaude/bin/openclaude');
    try {
      require('fs').accessSync(projectOpenClaudePath, require('fs').constants.X_OK);
      return projectOpenClaudePath;
    } catch (error) {
      // 如果不存在或不可执行，返回undefined让SDK使用PATH查找
      return undefined;
    }
  }

  /**
   * 构建查询选项
   */
  private buildQueryOptions(baseOptions: any): any {
    const options = {
      ...baseOptions,
      env: this.buildEnvConfig()
    };

    const openClaudePath = this.getOpenClaudeExecutablePath();
    if (openClaudePath) {
      options.pathToClaudeCodeExecutable = openClaudePath;
    }

    return options;
  }

  /**
   * 构建OpenClaude环境变量配置
   */
  private buildEnvConfig() {
    // 从当前进程环境开始
    const env = { ...process.env } as Record<string, string>;

    // 如果配置了自定义openclaude路径，添加到PATH
    const openClaudePath = this.getOpenClaudeExecutablePath();
    if (openClaudePath) {
      const openClaudeBinPath = require('path').dirname(openClaudePath);
      if (env.PATH && !env.PATH.includes(openClaudeBinPath)) {
        env.PATH = `${openClaudeBinPath}:${env.PATH}`;
      }
    }

    // 尝试所有可能的环境变量组合
    if (this.apiConfig.apiKey) {
      // 组合1: Anthropic原生格式
      env.ANTHROPIC_API_KEY = this.apiConfig.apiKey;
      env.ANTHROPIC_AUTH_TOKEN = this.apiConfig.apiKey;

      // 组合2: OpenAI兼容格式
      env.OPENAI_API_KEY = this.apiConfig.apiKey;

      // 通用设置
      if (this.apiConfig.baseUrl) {
        env.ANTHROPIC_BASE_URL = this.apiConfig.baseUrl;
        env.OPENAI_BASE_URL = this.apiConfig.baseUrl;
      }

      if (this.apiConfig.model) {
        env.ANTHROPIC_MODEL = this.apiConfig.model;
        env.OPENAI_MODEL = this.apiConfig.model;
      }

      // 尝试设置提供商标志
      // 如果baseUrl包含"anthropic"，可能是Anthropic兼容端点
      if (this.apiConfig.baseUrl && this.apiConfig.baseUrl.includes('anthropic')) {
        // 尝试明确使用Anthropic模式
        env.CLAUDE_CODE_USE_ANTHROPIC = '1';
        delete env.CLAUDE_CODE_USE_OPENAI;
      } else {
        // 否则尝试OpenAI模式
        env.CLAUDE_CODE_USE_OPENAI = '1';
        delete env.CLAUDE_CODE_USE_ANTHROPIC;
      }
    }

    return env;
  }

  /**
   * 处理本地源文件，更新wiki
   * @param filePath 源文件的完整路径
   */
  async ingestFromPath(filePath: string): Promise<{result: string; costUsd: number; messages: any[]}> {
    try {
      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);

      // 复制文件到raw目录（可选）
      const rawDir = path.join(this.wikiRoot, 'raw');
      await fs.mkdir(rawDir, { recursive: true });
      const destPath = path.join(rawDir, fileName);
      await fs.copyFile(filePath, destPath);

      // 构建系统提示，基于guide.md规范
      const systemPrompt = `你是一个LLM Wiki维护者。根据以下指南处理新源文件：

指南要点：
1. 读取并理解源文件内容
2. 创建/更新wiki页面，包括摘要和实体页面
3. 更新index.md索引文件，添加新页面链接和简要描述
4. 更新log.md日志文件，添加处理记录
5. 确保wiki的一致性和完整性

Wiki根目录：${this.wikiRoot}
Wiki结构：
- wiki/目录：所有wiki页面（Markdown格式）
- index.md：索引文件，按类别列出所有页面
- log.md：日志文件，记录所有操作

请处理新源文件，并更新相关wiki文件。`;

      const q = query({
        prompt: `请处理新源文件：${fileName}\n\n文件路径：${filePath}\n\n文件内容：\n${fileContent}\n\n请根据LLM Wiki规范更新wiki。确保更新index.md和log.md。`,
        options: this.buildQueryOptions({
          cwd: this.wikiRoot,
          permissionMode: 'dontAsk', // 在root环境下不能使用bypassPermissions
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'], // 明确允许的工具
          maxTurns: 30,
          systemPrompt: systemPrompt,
          maxBudgetUsd: 10000.00 // 设置很高预算限制
        })
      });

      const { result, costUsd, messages } = await collectMessages(q);
      console.log(`Ingest完成，成本: $${costUsd}, 消息数: ${messages.length}`);

      return {
        result: result || '处理完成，但未返回结果',
        costUsd,
        messages
      };
    } catch (error) {
      console.error('Ingest失败:', error);
      throw new Error(`Ingest失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 查询wiki知识库
   * @param question 自然语言问题
   */
  async query(question: string): Promise<{result: string; costUsd: number; messages: any[]}> {
    try {
      const systemPrompt = `你是一个LLM Wiki查询助手。根据以下指南回答查询：

指南要点：
1. 搜索相关wiki页面（参考index.md）
2. 读取相关页面内容
3. 综合信息生成答案
4. 答案应包含引用（链接到相关页面）
5. 如果答案有价值，可考虑保存为新wiki页面

Wiki根目录：${this.wikiRoot}
Wiki结构：
- wiki/目录：所有wiki页面（Markdown格式）
- index.md：索引文件，按类别列出所有页面

请基于wiki内容回答问题。`;

      const q = query({
        prompt: `问题：${question}\n\nWiki根目录：${this.wikiRoot}\n\n请基于LLM Wiki内容回答。`,
        options: this.buildQueryOptions({
          cwd: this.wikiRoot,
          permissionMode: 'dontAsk',
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
          maxTurns: 20,
          systemPrompt: systemPrompt,
          maxBudgetUsd: 10000.00 // 设置很高预算限制
        })
      });

      const { result, costUsd, messages } = await collectMessages(q);
      console.log(`Query完成，成本: $${costUsd}, 消息数: ${messages.length}`);

      return {
        result: result || '未找到相关答案',
        costUsd,
        messages
      };
    } catch (error) {
      console.error('Query失败:', error);
      throw new Error(`Query失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 检查wiki健康度，维护一致性
   */
  async lint(): Promise<{result: string; costUsd: number; messages: any[]}> {
    try {
      const systemPrompt = `你是一个LLM Wiki健康检查工具。根据以下指南执行lint操作：

指南要点：
1. 检查wiki一致性：页面间有无矛盾
2. 检测过时信息：是否有新源文件已更新但页面未更新
3. 发现孤立页面：没有入链的页面
4. 识别重要概念缺失：提及但无独立页面
5. 检查缺失的交叉引用
6. 建议需要调查的新问题和需要寻找的新源文件

Wiki根目录：${this.wikiRoot}

请执行全面的wiki健康检查，并生成报告。`;

      const q = query({
        prompt: `请对LLM Wiki执行健康检查，wiki根目录：${this.wikiRoot}\n\n发现并报告问题，提出改进建议。`,
        options: this.buildQueryOptions({
          cwd: this.wikiRoot,
          permissionMode: 'dontAsk',
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
          maxTurns: 35,
          systemPrompt: systemPrompt,
          maxBudgetUsd: 10000.00 // 设置很高预算限制
        })
      });

      const { result, costUsd, messages } = await collectMessages(q);
      console.log(`Lint完成，成本: $${costUsd}, 消息数: ${messages.length}`);

      return {
        result: result || 'Lint检查完成，未发现问题',
        costUsd,
        messages
      };
    } catch (error) {
      console.error('Lint失败:', error);
      throw new Error(`Lint失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 浏览目录内容
   */
  async listDirectory(dirPath?: string): Promise<{files: string[]; directories: string[]}> {
    try {
      const targetPath = dirPath || this.wikiRoot;

      // 确保目录存在
      if (!fss.existsSync(targetPath)) {
        if (targetPath === this.wikiRoot) {
          this.ensureWikiDirectory();
        } else {
          return { files: [], directories: [] };
        }
      }

      const items = await fs.readdir(targetPath, { withFileTypes: true });

      const files: string[] = [];
      const directories: string[] = [];

      for (const item of items) {
        if (item.isDirectory()) {
          directories.push(item.name);
        } else {
          files.push(item.name);
        }
      }

      return { files, directories };
    } catch (error) {
      console.error('目录浏览失败:', error);
      return { files: [], directories: [] };
    }
  }

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      // 如果是ENOENT错误，检查是否是关键wiki文件
      if (error.code === 'ENOENT') {
        const fileName = path.basename(filePath);
        const dirName = path.dirname(filePath);

        // 如果是wiki根目录下的关键文件
        if (dirName === this.wikiRoot || dirName === path.join(this.wikiRoot, 'wiki')) {
          if (fileName === 'log.md') {
            return '# LLM Wiki Log\n\n| 时间 | 操作 | 文件 | 备注 |\n|------|------|------|------|\n';
          } else if (fileName === 'index.md') {
            return '# LLM Wiki Index\n\n## 页面列表\n\n### 待分类\n\n（暂无页面）\n';
          }
        }
      }

      console.error('读取文件失败:', error);
      throw new Error(`读取文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取wiki状态信息
   */
  async getStatus(): Promise<{
    rawFiles: number;
    wikiPages: number;
    indexSize: number;
    logEntries: number;
    wikiRoot: string;
  }> {
    try {
      const rawDir = path.join(this.wikiRoot, 'raw');
      const wikiDir = path.join(this.wikiRoot, 'wiki');
      const indexPath = path.join(this.wikiRoot, 'index.md');
      const logPath = path.join(this.wikiRoot, 'log.md');

      const [rawFiles, wikiPages, indexContent, logContent] = await Promise.allSettled([
        fs.readdir(rawDir).then(files => files.length).catch(() => 0),
        fs.readdir(wikiDir).then(files => files.length).catch(() => 0),
        fs.readFile(indexPath, 'utf-8').catch(() => ''),
        fs.readFile(logPath, 'utf-8').catch(() => '')
      ]);

      // 计算日志条目数（按##开头计数）
      const logEntries = logContent.status === 'fulfilled' ?
        (logContent.value.match(/^## /gm) || []).length : 0;

      return {
        rawFiles: rawFiles.status === 'fulfilled' ? rawFiles.value : 0,
        wikiPages: wikiPages.status === 'fulfilled' ? wikiPages.value : 0,
        indexSize: indexContent.status === 'fulfilled' ? indexContent.value.length : 0,
        logEntries,
        wikiRoot: this.wikiRoot
      };
    } catch (error) {
      console.error('获取状态失败:', error);
      return { rawFiles: 0, wikiPages: 0, indexSize: 0, logEntries: 0, wikiRoot: this.wikiRoot };
    }
  }

  /**
   * 创建SDK查询对象，用于流式处理
   */
  createQuery(prompt: string, options?: any) {
    const systemPrompt = `你是一个LLM Wiki维护者。根据以下指南处理请求：

指南要点：
1. 读取并理解源文件内容
2. 创建/更新wiki页面，包括摘要和实体页面
3. 更新index.md索引文件，添加新页面链接和简要描述
4. 更新log.md日志文件，添加处理记录
5. 确保wiki的一致性和完整性

Wiki根目录：${this.wikiRoot}
Wiki结构：
- wiki/目录：所有wiki页面（Markdown格式）
- index.md：索引文件，按类别列出所有页面
- log.md：日志文件，记录所有操作

请处理请求，并更新相关wiki文件。`;

    return query({
      prompt,
      options: {
        cwd: this.wikiRoot,
        permissionMode: 'dontAsk',
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        maxTurns: 30,
        systemPrompt,
        maxBudgetUsd: 10000.00,
        pathToClaudeCodeExecutable: this.getOpenClaudeExecutablePath(),
        env: this.buildEnvConfig(),
        ...options
      }
    });
  }

  /**
   * 流式处理Ingest操作
   */
  async ingestStream(filePath: string, onMessage: (msg: any) => void): Promise<{result: string; costUsd: number}> {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // 复制文件到raw目录
    const rawDir = path.join(this.wikiRoot, 'raw');
    await fs.mkdir(rawDir, { recursive: true });
    const destPath = path.join(rawDir, fileName);
    await fs.copyFile(filePath, destPath);

    const prompt = `请处理新源文件：${fileName}\n\n文件路径：${filePath}\n\n文件内容：\n${fileContent}\n\n请根据LLM Wiki规范更新wiki。确保更新index.md和log.md。`;

    const q = this.createQuery(prompt);
    let result = '';
    let costUsd = 0;

    for await (const msg of q) {
      onMessage(msg);

      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          result = msg.result || '';
        } else {
          // 错误类型，使用错误信息
          result = `错误: ${msg.subtype}`;
        }
        costUsd = msg.total_cost_usd || 0;
      }
    }

    return { result, costUsd };
  }

  /**
   * 流式处理Query操作
   */
  async queryStream(question: string, onMessage: (msg: any) => void): Promise<{result: string; costUsd: number}> {
    const systemPrompt = `你是一个LLM Wiki查询助手。根据以下指南回答查询：

指南要点：
1. 搜索相关wiki页面（参考index.md）
2. 读取相关页面内容
3. 综合信息生成答案
4. 答案应包含引用（链接到相关页面）
5. 如果答案有价值，可考虑保存为新wiki页面

Wiki根目录：${this.wikiRoot}
Wiki结构：
- wiki/目录：所有wiki页面（Markdown格式）
- index.md：索引文件，按类别列出所有页面

请基于wiki内容回答问题。`;

    const q = query({
      prompt: `问题：${question}\n\nWiki根目录：${this.wikiRoot}\n\n请基于LLM Wiki内容回答。`,
      options: {
        cwd: this.wikiRoot,
        permissionMode: 'dontAsk',
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        maxTurns: 20,
        systemPrompt,
        maxBudgetUsd: 10000.00,
        pathToClaudeCodeExecutable: this.getOpenClaudeExecutablePath(),
        env: this.buildEnvConfig()
      }
    });

    let result = '';
    let costUsd = 0;

    for await (const msg of q) {
      onMessage(msg);

      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          result = msg.result || '';
        } else {
          // 错误类型，使用错误信息
          result = `错误: ${msg.subtype}`;
        }
        costUsd = msg.total_cost_usd || 0;
      }
    }

    return { result, costUsd };
  }

  /**
   * 流式处理Lint操作
   */
  async lintStream(onMessage: (msg: any) => void): Promise<{result: string; costUsd: number}> {
    const systemPrompt = `你是一个LLM Wiki健康检查工具。根据以下指南执行lint操作：

指南要点：
1. 检查wiki一致性：页面间有无矛盾
2. 检测过时信息：是否有新源文件已更新但页面未更新
3. 发现孤立页面：没有入链的页面
4. 识别重要概念缺失：提及但无独立页面
5. 检查缺失的交叉引用
6. 建议需要调查的新问题和需要寻找的新源文件

Wiki根目录：${this.wikiRoot}

请执行全面的wiki健康检查，并生成报告。`;

    const q = query({
      prompt: `请对LLM Wiki执行健康检查，wiki根目录：${this.wikiRoot}\n\n发现并报告问题，提出改进建议。`,
      options: {
        cwd: this.wikiRoot,
        permissionMode: 'dontAsk',
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        maxTurns: 35,
        systemPrompt,
        maxBudgetUsd: 10000.00,
        pathToClaudeCodeExecutable: this.getOpenClaudeExecutablePath(),
        env: this.buildEnvConfig()
      }
    });

    let result = '';
    let costUsd = 0;

    for await (const msg of q) {
      onMessage(msg);

      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          result = msg.result || '';
        } else {
          // 错误类型，使用错误信息
          result = `错误: ${msg.subtype}`;
        }
        costUsd = msg.total_cost_usd || 0;
      }
    }

    return { result, costUsd };
  }
}