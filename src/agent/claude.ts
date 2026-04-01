/**
 * Claude Code CLI 封装
 * 通过子进程调用 claude CLI
 */

import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

// API Key 缓存（5分钟过期）
let cachedApiKey: string | null = null;
let cacheExpireAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface AgentOptions {
  /** 最大轮次 */
  maxTurns?: number;
  /** 工作目录 */
  cwd?: string;
  /** 允许的工具 */
  allowedTools?: string[];
  /** 附加系统提示 */
  systemPrompt?: string;
  /** 进度回调 */
  onProgress?: (status: string) => void;
  /** 对话历史（用于上下文注入） */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 飞书上下文（用于 MCP 工具回复到正确的 thread） */
  feishuContext?: {
    chatId: string;
    rootId?: string;
  };
}

export interface AgentResult {
  /** 最终回复文本 */
  response: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

interface ClaudeJsonOutput {
  result?: string;
  session_id?: string;
  error?: string;
  is_error?: boolean;
}

/**
 * 获取 API Key（带缓存）
 */
async function getApiKey(env: Record<string, string>): Promise<string | null> {
  const now = Date.now();

  // 使用缓存
  if (cachedApiKey && now < cacheExpireAt) {
    return cachedApiKey;
  }

  try {
    const settingsPath = path.join(homedir(), '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      return null;
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (!settings.apiKeyHelper) {
      return null;
    }

    const helperPath = settings.apiKeyHelper;
    if (!fs.existsSync(helperPath)) {
      return null;
    }

    const proc = Bun.spawn(['bash', helperPath], {
      stdout: 'pipe',
      stderr: 'pipe',
      env,
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0 && stdout.trim()) {
      cachedApiKey = stdout.trim();
      cacheExpireAt = now + CACHE_TTL_MS;
      return cachedApiKey;
    }
  } catch (error) {
    logger.warn('Failed to get API key', { error });
  }

  return null;
}

/**
 * 读取 Claude 配置并构建环境变量
 */
async function getClaudeEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };

  try {
    const settingsPath = path.join(homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

      // 合并 env 配置
      if (settings.env) {
        Object.assign(env, settings.env);
      }
    }
  } catch (error) {
    logger.warn('Failed to read Claude settings', { error });
  }

  // 获取 API Key（带缓存）
  const apiKey = await getApiKey(env);
  if (apiKey) {
    env['ANTHROPIC_API_KEY'] = apiKey;
  }

  // 清除嵌套检测
  env['CLAUDECODE'] = '';
  env['TERM'] = 'dumb';

  return env;
}

/**
 * 运行 Claude Code Agent（支持流式进度回调）
 */
export async function runAgent(prompt: string, options: AgentOptions = {}): Promise<AgentResult> {
  const {
    maxTurns = 10,
    cwd = process.env.CLAUDE_WORK_DIR || homedir(),
    allowedTools,
    systemPrompt,
    onProgress,
    history,
  } = options;

  // 构建带历史的 prompt
  let fullPrompt = prompt;
  if (history && history.length > 0) {
    const historyText = history
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    fullPrompt = `以下是之前的对话历史：\n\n${historyText}\n\n---\n\n用户最新消息：${prompt}`;
  }

  logger.info('Running Claude agent', {
    promptLength: fullPrompt.length,
    maxTurns,
    historyCount: history?.length || 0,
    hasProgressCallback: !!onProgress,
    hasSystemPrompt: !!systemPrompt,
    systemPromptLength: systemPrompt?.length || 0,
  });

  if (systemPrompt) {
    logger.info('System prompt will be injected', {
      preview: systemPrompt.slice(0, 300),
      length: systemPrompt.length,
    });
  }

  try {
    // 构建命令参数
    const useStreamJson = !!onProgress;
    const args: string[] = [
      '-p', fullPrompt,
      '--output-format', useStreamJson ? 'stream-json' : 'json',
      '--max-turns', String(maxTurns),
      '--dangerously-skip-permissions',
    ];

    if (useStreamJson) {
      args.push('--verbose');
    }

    if (allowedTools && allowedTools.length > 0) {
      args.push('--allowedTools', allowedTools.join(','));
    }

    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }

    // 注入飞书上下文指令
    if (options.feishuContext) {
      const chatId = options.feishuContext.chatId;
      const rootId = options.feishuContext.rootId;

      let feishuInstruction = `\n\n[飞书交互环境]
你正在通过飞书与用户对话。文本回复会自动发送，但图片需要你主动发送。

关键规则：
1. 发送图片给用户：必须使用 feishu_send_image 工具（传 image_path 和 chat_id: "${chatId}"${rootId ? `，root_id: "${rootId}"` : ''}）
2. Read 工具读取的图片用户看不到，只有你能看到
3. 如果用户让你发送某个图片给他，必须用 feishu_send_image，不是 Read`;

      args.push('--append-system-prompt', feishuInstruction);
    }

    const env = await getClaudeEnv();

    // 传递飞书上下文给 MCP 工具
    if (options.feishuContext) {
      env['FEISHU_CHAT_ID'] = options.feishuContext.chatId;
      if (options.feishuContext.rootId) {
        env['FEISHU_ROOT_ID'] = options.feishuContext.rootId;
      }
    }

    logger.info('Calling Claude CLI', {
      cwd,
      useStreamJson,
      hasApiKey: !!env['ANTHROPIC_API_KEY'],
      model: env['ANTHROPIC_MODEL'],
      argsCount: args.length,
      hasAppendSystemPrompt: args.includes('--append-system-prompt'),
    });

    // 详细记录 CLI 参数（调试用）
    logger.info('Claude CLI args', {
      args: args.map((arg, i) => {
        // 对长参数值进行截断
        if (i > 0 && args[i - 1] === '-p') return '[prompt truncated]';
        if (i > 0 && args[i - 1] === '--append-system-prompt') return `[system prompt: ${arg.length} chars]`;
        return arg;
      }),
    });

    // 直接使用完整命令替代别名，确保可执行
    const proc = Bun.spawn(['ccr', 'code', ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env,
    });

    let finalResult: AgentResult | null = null;
    let lastStatus = '';

    if (useStreamJson) {
      // 流式读取 stdout
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按行解析 JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            const status = parseStreamEvent(event);
            if (status && status !== lastStatus) {
              lastStatus = status;
              onProgress?.(status);
            }
            // 捕获最终结果
            if (event.type === 'result') {
              finalResult = {
                response: event.result || '',
                success: !event.is_error,
                error: event.is_error ? (event.result || 'Unknown error') : undefined,
              };
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      if (stderr) {
        logger.warn('Claude stderr', { stderr: stderr.slice(0, 500) });
      }

      if (finalResult) {
        return finalResult;
      }
      return { response: '', success: false, error: '未收到结果' };

    } else {
      // 非流式模式（原逻辑）
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      logger.info('Claude CLI returned', {
        exitCode,
        stdoutLen: stdout.length,
        stderrLen: stderr.length,
      });

      if (stderr) {
        logger.warn('Claude stderr', { stderr: stderr.slice(0, 500) });
      }

      if (exitCode !== 0) {
        logger.error('Claude CLI failed', { exitCode, stderr: stderr.slice(0, 500), stdout: stdout.slice(0, 500) });
        return {
          response: '',
          success: false,
          error: `CLI exited with code ${exitCode}: ${stderr || stdout}`.slice(0, 200),
        };
      }

      return parseClaudeOutput(stdout);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent error', { error: errorMessage });

    return {
      response: '',
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 解析流式事件，返回状态描述
 */
function parseStreamEvent(event: any): string | null {
  switch (event.type) {
    case 'assistant':
      if (event.message?.content) {
        const content = event.message.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'tool_use') {
              return `🔧 ${item.name}`;
            }
            if (item.type === 'text' && item.text) {
              // 返回文本的前 50 个字符
              const preview = item.text.slice(0, 50).replace(/\n/g, ' ');
              return `💬 ${preview}${item.text.length > 50 ? '...' : ''}`;
            }
          }
        }
      }
      return '💭 思考中...';
    case 'tool':
      return `⚙️ 执行工具...`;
    case 'result':
      return event.is_error ? '❌ 出错' : '✅ 完成';
    default:
      return null;
  }
}

/**
 * 解析 Claude CLI JSON 输出
 */
function parseClaudeOutput(stdout: string): AgentResult {
  try {
    // 尝试解析完整输出
    const data: ClaudeJsonOutput = JSON.parse(stdout.trim());

    if (data.is_error || data.error) {
      return {
        response: '',
        success: false,
        error: data.error || 'Unknown error',
      };
    }

    return {
      response: data.result || '',
      success: true,
    };
  } catch {
    // 如果不是有效 JSON，直接返回文本
    logger.debug('Non-JSON output, using raw text');
    return {
      response: stdout.trim(),
      success: true,
    };
  }
}
