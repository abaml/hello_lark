/**
 * 编排器 - 协调飞书消息与 Claude Agent
 */

import { logger } from '../utils/logger';
import { sessionManager, getSessionKey } from '../session';
import {
  sendTextMessage,
  sendCardMessage,
  updateCardMessage,
  replyCardMessage,
  buildProgressCard,
  buildResultCard,
  type MessageEvent,
} from '../feishu';
import { runAgent } from './claude';
import { scheduler } from '../scheduler';
import type { ScheduledTask } from '../scheduler/types';
import { memoryService, feedbackCollector } from '../memory';

// 查询 chat_id
const CHATID_PATTERNS = [/^(?:chatid|chat_id|会话id)$/i];

// 定时任务命令
const TASK_LIST_PATTERNS = [/^(?:tasks|任务列表|定时任务)$/i];
const TASK_TRIGGER_PATTERNS = [/^(?:run|执行|触发)\s+(.+)$/i];
const TASK_ENABLE_PATTERNS = [/^(?:enable|启用)\s+(.+)$/i];
const TASK_DISABLE_PATTERNS = [/^(?:disable|禁用)\s+(.+)$/i];
const TASK_DELETE_PATTERNS = [/^(?:delete|删除任务|移除任务)\s+(.+)$/i];
const TASK_ADD_CUSTOM = [/^(?:定时|schedule|cron)\s+(.+)$/i];

// 记忆命令
const REMEMBER_PATTERNS = [/^(?:记住|remember)[：:\s]+(.+)$/i];
const FORGET_PATTERNS = [/^(?:忘记|忘掉|forget)[：:\s]+(.+)$/i];
const LIST_MEMORY_PATTERNS = [/^(?:记忆|memories|我的记忆)$/i];

/**
 * 判断是否为内置命令
 */
function isBuiltinCommand(content: string): boolean {
  const trimmed = content.trim();
  const patterns = [
    ...CHATID_PATTERNS,
    ...TASK_LIST_PATTERNS,
    ...TASK_TRIGGER_PATTERNS,
    ...TASK_ENABLE_PATTERNS,
    ...TASK_DISABLE_PATTERNS,
    ...TASK_DELETE_PATTERNS,
    ...TASK_ADD_CUSTOM,
    ...REMEMBER_PATTERNS,
    ...FORGET_PATTERNS,
    ...LIST_MEMORY_PATTERNS,
  ];
  return patterns.some(p => p.test(trimmed));
}

/**
 * 判断是否应该创建新话题
 *
 * 规则：
 * - 内置命令：不创建
 * - 已在话题内：不创建
 * - 短消息 + 最近有上下文：可能是跟进，不创建
 * - 明显的跟进词：不创建
 * - 其他：创建新话题
 */
function shouldCreateThread(
  content: string,
  isInThread: boolean,
  hasRecentContext: boolean
): boolean {
  // 内置命令不创建
  if (isBuiltinCommand(content)) return false;

  // 已经在话题里，不再创建
  if (isInThread) return false;

  const trimmed = content.trim();

  // 短消息 + 有最近上下文 → 可能是跟进
  if (trimmed.length < 15 && hasRecentContext) return false;

  // 明显的跟进词
  const followUpPatterns = /^(为什么|怎么|这个|那个|继续|然后|还有|好的|可以|不对|是的|对|嗯|ok|行|再|把)/i;
  if (followUpPatterns.test(trimmed)) return false;

  // 问号结尾的短问题，可能是跟进
  if (trimmed.length < 30 && trimmed.endsWith('?') && hasRecentContext) return false;
  if (trimmed.length < 30 && trimmed.endsWith('？') && hasRecentContext) return false;

  // 其他情况：创建新话题
  return true;
}

/**
 * 处理内置命令
 */
async function handleBuiltinCommand(content: string, chatId: string, senderId: string): Promise<string | null> {
  // chatid 命令
  for (const pattern of CHATID_PATTERNS) {
    if (pattern.test(content)) {
      return `当前会话 chat_id: ${chatId}`;
    }
  }

  // 任务列表
  for (const pattern of TASK_LIST_PATTERNS) {
    if (pattern.test(content)) {
      const tasks = scheduler.listTasksByChatId(chatId);
      if (tasks.length === 0) {
        return '当前会话暂无定时任务\n\n添加任务示例：定时 每天10点 帮我看看 AI 新闻';
      }
      const lines = tasks.map(t => {
        const status = t.enabled ? '✅' : '⏸️';
        const lastRun = t.lastRunAt ? new Date(t.lastRunAt).toLocaleString('zh-CN') : '从未执行';
        return `${status} **${t.name}** (${t.id})\n   Cron: ${t.cron}\n   上次执行: ${lastRun}`;
      });
      return `📅 当前会话定时任务:\n\n${lines.join('\n\n')}`;
    }
  }

  // 执行任务
  for (const pattern of TASK_TRIGGER_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const taskId = match[1].trim();
      const task = scheduler.getTask(taskId);
      if (!task) return `任务不存在: ${taskId}`;
      scheduler.triggerNow(taskId);
      return `正在执行任务: ${task.name}，结果稍后发送`;
    }
  }

  // 启用任务
  for (const pattern of TASK_ENABLE_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const taskId = match[1].trim();
      return scheduler.enable(taskId) ? `已启用任务: ${taskId}` : `任务不存在: ${taskId}`;
    }
  }

  // 禁用任务
  for (const pattern of TASK_DISABLE_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const taskId = match[1].trim();
      return scheduler.disable(taskId) ? `已禁用任务: ${taskId}` : `任务不存在: ${taskId}`;
    }
  }

  // 删除任务
  for (const pattern of TASK_DELETE_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const taskId = match[1].trim();
      return scheduler.unregister(taskId) ? `已删除任务: ${taskId}` : `任务不存在: ${taskId}`;
    }
  }

  // 添加定时任务
  for (const pattern of TASK_ADD_CUSTOM) {
    const match = content.match(pattern);
    if (match) {
      return await parseCustomTaskWithAI(match[1].trim(), chatId);
    }
  }

  // 记住
  for (const pattern of REMEMBER_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const memory = match[1].trim();
      memoryService.remember(senderId, memory);
      return `✅ 已记住: ${memory}`;
    }
  }

  // 忘记
  for (const pattern of FORGET_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const keyword = match[1].trim();
      const count = memoryService.forget(senderId, keyword);
      return count > 0
        ? `✅ 已删除 ${count} 条相关记忆`
        : `未找到包含「${keyword}」的记忆`;
    }
  }

  // 列出记忆
  for (const pattern of LIST_MEMORY_PATTERNS) {
    if (pattern.test(content)) {
      return memoryService.listMemories(senderId);
    }
  }

  return null;
}

/**
 * 用 Claude 解析自然语言定时任务
 */
async function parseCustomTaskWithAI(input: string, chatId: string): Promise<string> {
  const parsePrompt = `你是一个定时任务解析助手。用户想要创建一个定时任务，请从输入中提取：
1. 执行时间 -> 转换成标准 5 段 cron 表达式（分 时 日 月 周）
2. 任务内容 -> 要执行的具体任务描述

用户输入: "${input}"

请严格按以下 JSON 格式返回，不要有任何其他内容：
{"cron": "分 时 日 月 周", "task": "任务内容", "timeDesc": "时间的中文描述"}

示例：
- "每天早上9点半 提醒我喝水" -> {"cron": "30 9 * * *", "task": "提醒我喝水", "timeDesc": "每天 9:30"}
- "工作日下午6点 总结今天工作" -> {"cron": "0 18 * * 1-5", "task": "总结今天工作", "timeDesc": "工作日 18:00"}
- "每周一上午10点 整理周报" -> {"cron": "0 10 * * 1", "task": "整理周报", "timeDesc": "每周一 10:00"}

注意：cron 格式是 5 段（分 时 日 月 周），不是 6 段。如果无法解析，返回 {"error": "原因"}`;

  try {
    const result = await runAgent(parsePrompt, { maxTurns: 1 });

    if (!result.success || !result.response) {
      return `解析失败: ${result.error || '未知错误'}`;
    }

    const jsonMatch = result.response.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return `解析失败: 无法提取结果`;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.error) {
      return `无法解析: ${parsed.error}`;
    }

    if (!parsed.cron || !parsed.task) {
      return `解析失败: 缺少必要字段`;
    }

    const taskId = `${chatId.slice(-8)}-${Date.now().toString(36)}`;
    const taskName = parsed.task.length > 20 ? parsed.task.slice(0, 20) + '...' : parsed.task;

    const task: ScheduledTask = {
      id: taskId,
      name: taskName,
      cron: parsed.cron,
      prompt: parsed.task,
      chatId,
      enabled: true,
      createdAt: Date.now(),
    };

    scheduler.register(task);
    return `✅ 已添加定时任务\n\n任务: ${parsed.task}\n时间: ${parsed.timeDesc || parsed.cron}\n\n发送 \`tasks\` 查看任务列表`;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `创建任务失败: ${msg}`;
  }
}

/**
 * 处理飞书消息
 */
export async function handleMessage(event: MessageEvent): Promise<void> {
  const { chatId, chatType, senderId, content, messageType, messageId: userMessageId, rootId } = event;

  // 只处理文本和转发消息
  if (messageType !== 'text' && messageType !== 'merge_forward') {
    logger.debug('Unsupported message type ignored', { messageType });
    return;
  }

  if (!content.trim()) {
    return;
  }

  // 判断是否在话题内
  const isInThread = !!rootId;

  // 判断是否应该创建新话题
  const hasRecentContext = sessionManager.hasRecentContext(chatId);
  const createThread = shouldCreateThread(content, isInThread, hasRecentContext);

  // 确定 session key
  // - 如果已在话题内，使用话题的 rootId
  // - 如果要创建新话题，使用当前消息 ID 作为新话题的 root
  // - 否则使用 chatId（主聊天）
  const effectiveRootId = isInThread ? rootId : (createThread ? userMessageId : undefined);
  const sessionKey = getSessionKey(chatId, effectiveRootId);

  logger.debug('Message routing', {
    isInThread,
    createThread,
    hasRecentContext,
    sessionKey,
  });

  // 获取或创建 session
  const session = sessionManager.getOrCreate({
    chatId,
    chatType,
    userId: senderId,
    rootId: effectiveRootId,
  });

  // 检查内置命令（内置命令不创建话题）
  const builtinResponse = await handleBuiltinCommand(content.trim(), chatId, senderId);
  if (builtinResponse) {
    await sendTextMessage(chatId, builtinResponse);
    return;
  }

  // 记录用户消息
  sessionManager.addMessage(sessionKey, 'user', content);

  // 分析反馈信号
  const feedbackSignal = feedbackCollector.analyze(content);
  if (feedbackSignal.type !== 'neutral') {
    // 获取上一条 assistant 消息作为上下文
    const lastAssistant = session.history.filter(m => m.role === 'assistant').pop();
    const context = lastAssistant?.content.slice(0, 100);
    feedbackCollector.record(sessionKey, userMessageId, feedbackSignal, context);
  }

  // 发送进度卡片
  const progressCard = buildProgressCard('💭 思考中...');
  let cardMessageId: string | null;

  if (createThread || isInThread) {
    // 在话题中回复（创建新话题或在现有话题中回复）
    const replyToId = isInThread ? rootId! : userMessageId;
    cardMessageId = await replyCardMessage(replyToId, progressCard, true);
  } else {
    // 在主聊天中回复
    cardMessageId = await sendCardMessage(chatId, progressCard);
  }

  if (!cardMessageId) {
    // 卡片发送失败，回退到普通模式
    const fallbackMemory = memoryService.buildMemoryContext(senderId, session.workDir);
    try {
      const result = await runAgent(content, {
        cwd: session.workDir,
        maxTurns: 20,
        history: session.history,
        systemPrompt: fallbackMemory || undefined,
        feishuContext: { chatId, rootId: effectiveRootId },
      });
      if (result.success && result.response) {
        sessionManager.addMessage(sessionKey, 'assistant', result.response);
        await sendTextMessage(chatId, result.response);
      } else {
        await sendTextMessage(chatId, `抱歉，${result.error || '处理失败，请稍后重试'}`);
      }
    } catch (error) {
      logger.error('Orchestrator error', error as Error);
      await sendTextMessage(chatId, '处理过程中发生错误，请稍后重试');
    }
    return;
  }

  // 构建记忆上下文
  const memoryContext = memoryService.buildMemoryContext(senderId, session.workDir);
  logger.info('Memory context built', {
    senderId,
    length: memoryContext?.length || 0,
    hasContent: !!memoryContext && memoryContext.length > 0,
    preview: memoryContext?.slice(0, 300),
  });

  // 使用流式模式，实时更新卡片
  let lastUpdateTime = 0;
  const UPDATE_INTERVAL = 1000;

  try {
    const result = await runAgent(content, {
      cwd: session.workDir,
      maxTurns: 20,
      history: session.history,
      systemPrompt: memoryContext || undefined,
      feishuContext: { chatId, rootId: effectiveRootId },
      onProgress: async (status) => {
        const now = Date.now();
        if (now - lastUpdateTime > UPDATE_INTERVAL) {
          lastUpdateTime = now;
          const card = buildProgressCard(status);
          await updateCardMessage(cardMessageId!, card);
        }
      },
    });

    // 更新最终结果
    if (result.success && result.response) {
      sessionManager.addMessage(sessionKey, 'assistant', result.response);
      const resultCard = buildResultCard(result.response, true);
      await updateCardMessage(cardMessageId, resultCard);
    } else {
      const errorMsg = result.error || '处理失败，请稍后重试';
      const resultCard = buildResultCard(errorMsg, false);
      await updateCardMessage(cardMessageId, resultCard);
    }
  } catch (error) {
    logger.error('Orchestrator error', error as Error);
    const resultCard = buildResultCard('处理过程中发生错误，请稍后重试', false);
    await updateCardMessage(cardMessageId, resultCard);
  }
}
