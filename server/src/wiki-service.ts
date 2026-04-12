import { query, collectMessages, Options } from '@codrstudio/openclaude-sdk';
import path from 'path';
import fs from 'fs/promises';

/**
 * LLM Wiki服务，基于OpenClaude SDK实现guide.md中描述的功能
 */
export class WikiService {
  private wikiRoot: string;

  constructor(wikiRoot?: string) {
    // 默认使用项目目录下的wiki-data
    this.wikiRoot = wikiRoot || path.join(process.cwd(), '..', 'wiki-data');
  }

  /**
   * 处理新源文件，更新wiki
   * @param filePath 源文件路径
   * @param fileName 文件名（可选）
   */
  async ingest(fileContent: string, fileName?: string): Promise<string> {
    try {
      // 保存源文件到raw目录
      const rawDir = path.join(this.wikiRoot, 'raw');
      await fs.mkdir(rawDir, { recursive: true });

      const safeFileName = fileName || `source_${Date.now()}.txt`;
      const filePath = path.join(rawDir, safeFileName);
      await fs.writeFile(filePath, fileContent, 'utf-8');

      // 构建系统提示，基于guide.md规范
      const systemPrompt = `你是一个LLM Wiki维护者。根据以下指南处理新源文件：

指南要点：
1. 读取并理解源文件内容
2. 创建/更新wiki页面，包括摘要和实体页面
3. 更新index.md索引文件，添加新页面链接和简要描述
4. 更新log.md日志文件，添加处理记录
5. 确保wiki的一致性和完整性

Wiki结构：
- wiki/目录：所有wiki页面（Markdown格式）
- index.md：索引文件，按类别列出所有页面
- log.md：日志文件，记录所有操作

请处理新源文件，并更新相关wiki文件。`;

      const q = query({
        prompt: `请处理新源文件：${safeFileName}\n\n文件内容：\n${fileContent}\n\n请根据LLM Wiki规范更新wiki。`,
        options: {
          cwd: this.wikiRoot,
          permissionMode: 'dontAsk',
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Bash'], // 允许文件操作
          maxTurns: 15,
          systemPrompt: systemPrompt,
          maxBudgetUsd: 10000.00 // 设置很高预算限制
        }
      });

      const { result, costUsd } = await collectMessages(q);
      console.log(`Ingest完成，成本: $${costUsd}`);

      return result || '处理完成，但未返回结果';
    } catch (error) {
      console.error('Ingest失败:', error);
      throw new Error(`Ingest失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 查询wiki知识库
   * @param question 自然语言问题
   */
  async query(question: string): Promise<string> {
    try {
      const systemPrompt = `你是一个LLM Wiki查询助手。根据以下指南回答查询：

指南要点：
1. 搜索相关wiki页面（参考index.md）
2. 读取相关页面内容
3. 综合信息生成答案
4. 答案应包含引用（链接到相关页面）
5. 如果答案有价值，可考虑保存为新wiki页面

Wiki结构：
- wiki/目录：所有wiki页面（Markdown格式）
- index.md：索引文件，按类别列出所有页面

请基于wiki内容回答问题。`;

      const q = query({
        prompt: `问题：${question}\n\n请基于LLM Wiki内容回答。`,
        options: {
          cwd: this.wikiRoot,
          permissionMode: 'dontAsk',
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Bash'],
          maxTurns: 10,
          systemPrompt: systemPrompt,
          maxBudgetUsd: 10000.00 // 设置很高预算限制
        }
      });

      const { result, costUsd } = await collectMessages(q);
      console.log(`Query完成，成本: $${costUsd}`);

      return result || '未找到相关答案';
    } catch (error) {
      console.error('Query失败:', error);
      throw new Error(`Query失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 检查wiki健康度，维护一致性
   */
  async lint(): Promise<string> {
    try {
      const systemPrompt = `你是一个LLM Wiki健康检查工具。根据以下指南执行lint操作：

指南要点：
1. 检查wiki一致性：页面间有无矛盾
2. 检测过时信息：是否有新源文件已更新但页面未更新
3. 发现孤立页面：没有入链的页面
4. 识别重要概念缺失：提及但无独立页面
5. 检查缺失的交叉引用
6. 建议需要调查的新问题和需要寻找的新源文件

请执行全面的wiki健康检查，并生成报告。`;

      const q = query({
        prompt: '请对LLM Wiki执行健康检查，发现并报告问题，提出改进建议。',
        options: {
          cwd: this.wikiRoot,
          permissionMode: 'dontAsk',
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Bash'],
          maxTurns: 12,
          systemPrompt: systemPrompt,
          maxBudgetUsd: 10000.00 // 设置很高预算限制
        }
      });

      const { result, costUsd } = await collectMessages(q);
      console.log(`Lint完成，成本: $${costUsd}`);

      return result || 'Lint检查完成，未发现问题';
    } catch (error) {
      console.error('Lint失败:', error);
      throw new Error(`Lint失败: ${error instanceof Error ? error.message : String(error)}`);
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
        logEntries
      };
    } catch (error) {
      console.error('获取状态失败:', error);
      return { rawFiles: 0, wikiPages: 0, indexSize: 0, logEntries: 0 };
    }
  }
}