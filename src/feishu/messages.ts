/**
 * 飞书消息发送工具
 */

import * as fs from 'fs';
import * as path from 'path';
import { larkClient } from './client';
import { logger } from '../utils/logger';

export interface SendMessageOptions {
  chatId: string;
  content: string;
  msgType?: 'text' | 'interactive';
}

/**
 * 发送文本消息
 */
export async function sendTextMessage(chatId: string, text: string): Promise<string | null> {
  try {
    const response = await larkClient.im.v1.message.create({
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });

    if (response.code !== 0) {
      logger.error('Failed to send message', { code: response.code, msg: response.msg });
      return null;
    }

    const messageId = response.data?.message_id ?? null;
    logger.debug('Message sent', { chatId, messageId });
    return messageId;
  } catch (error) {
    logger.error('Error sending message', error as Error);
    return null;
  }
}

/**
 * 上传图片到飞书，返回 image_key
 */
export async function uploadImage(imagePath: string): Promise<string | null> {
  try {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
      logger.error('Image file not found', { path: absolutePath });
      return null;
    }

    const response = (await larkClient.im.v1.image.create({
      data: {
        image_type: 'message',
        image: fs.createReadStream(absolutePath),
      },
    })) as { code: number; msg?: string; data?: { image_key?: string } };

    if (response.code !== 0) {
      logger.error('Failed to upload image', { code: response.code, msg: response.msg });
      return null;
    }

    const imageKey = response.data?.image_key ?? null;
    logger.debug('Image uploaded', { path: imagePath, imageKey });
    return imageKey;
  } catch (error) {
    logger.error('Error uploading image', error as Error);
    return null;
  }
}

/**
 * 发送图片消息
 */
export async function sendImageMessage(
  chatId: string,
  imagePath: string,
  rootId?: string
): Promise<string | null> {
  const imageKey = await uploadImage(imagePath);
  if (!imageKey) {
    return null;
  }

  try {
    // 如果有 rootId，回复到 thread
    if (rootId) {
      const response = await larkClient.im.v1.message.reply({
        path: {
          message_id: rootId,
        },
        data: {
          msg_type: 'image',
          content: JSON.stringify({ image_key: imageKey }),
          reply_in_thread: true,
        },
      });

      if (response.code !== 0) {
        logger.error('Failed to reply image in thread', { code: response.code, msg: response.msg });
        return null;
      }

      const messageId = response.data?.message_id ?? null;
      logger.debug('Image replied in thread', { chatId, rootId, messageId, imageKey });
      return messageId;
    }

    // 否则发送到 chat
    const response = await larkClient.im.v1.message.create({
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        receive_id: chatId,
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      },
    });

    if (response.code !== 0) {
      logger.error('Failed to send image message', { code: response.code, msg: response.msg });
      return null;
    }

    const messageId = response.data?.message_id ?? null;
    logger.debug('Image message sent', { chatId, messageId, imageKey });
    return messageId;
  } catch (error) {
    logger.error('Error sending image message', error as Error);
    return null;
  }
}

/**
 * 更新消息（用于编辑已发送的消息）
 */
export async function updateMessage(messageId: string, text: string): Promise<boolean> {
  try {
    const response = await larkClient.im.v1.message.patch({
      path: {
        message_id: messageId,
      },
      data: {
        content: JSON.stringify({ text }),
      },
    });

    if (response.code !== 0) {
      logger.error('Failed to update message', { code: response.code, msg: response.msg });
      return false;
    }

    logger.debug('Message updated', { messageId });
    return true;
  } catch (error) {
    logger.error('Error updating message', error as Error);
    return false;
  }
}

/**
 * 发送消息卡片
 */
export async function sendCardMessage(chatId: string, card: object): Promise<string | null> {
  try {
    const response = await larkClient.im.v1.message.create({
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });

    if (response.code !== 0) {
      logger.error('Failed to send card', { code: response.code, msg: response.msg });
      return null;
    }

    return response.data?.message_id ?? null;
  } catch (error) {
    logger.error('Error sending card', error as Error);
    return null;
  }
}

/**
 * 回复消息（在话题中回复）
 */
export async function replyCardMessage(
  replyToMessageId: string,
  card: object,
  replyInThread: boolean = true
): Promise<string | null> {
  try {
    const response = await larkClient.im.v1.message.reply({
      path: {
        message_id: replyToMessageId,
      },
      data: {
        msg_type: 'interactive',
        content: JSON.stringify(card),
        reply_in_thread: replyInThread,
      },
    });

    if (response.code !== 0) {
      logger.error('Failed to reply card', { code: response.code, msg: response.msg });
      return null;
    }

    return response.data?.message_id ?? null;
  } catch (error) {
    logger.error('Error replying card', error as Error);
    return null;
  }
}

/**
 * 更新卡片消息
 */
export async function updateCardMessage(messageId: string, card: object): Promise<boolean> {
  try {
    const response = await larkClient.im.v1.message.patch({
      path: {
        message_id: messageId,
      },
      data: {
        content: JSON.stringify(card),
      },
    });

    if (response.code !== 0) {
      logger.error('Failed to update card', { code: response.code, msg: response.msg });
      return false;
    }

    logger.debug('Card updated', { messageId });
    return true;
  } catch (error) {
    logger.error('Error updating card', error as Error);
    return false;
  }
}

/**
 * 解析状态文本，提取图标和描述
 */
function parseStatus(status: string): { icon: string; title: string; template: string } {
  if (status.startsWith('🔧')) {
    return { icon: '🔧', title: '执行工具', template: 'blue' };
  }
  if (status.startsWith('💬')) {
    return { icon: '💬', title: '生成回复', template: 'turquoise' };
  }
  if (status.startsWith('⚙️')) {
    return { icon: '⚙️', title: '处理中', template: 'blue' };
  }
  if (status.startsWith('✅')) {
    return { icon: '✅', title: '完成', template: 'green' };
  }
  if (status.startsWith('❌')) {
    return { icon: '❌', title: '出错', template: 'red' };
  }
  // 默认思考状态
  return { icon: '🤔', title: '思考中', template: 'purple' };
}

/**
 * 构建进度卡片
 */
export function buildProgressCard(status: string, content?: string): object {
  const { icon, title, template } = parseStatus(status);

  // 移除状态文本中的图标前缀，保留描述
  const description = status.replace(/^[\p{Emoji}\uFE0F]+\s*/u, '').trim();

  const elements: any[] = [];

  // 状态描述
  if (description) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: description,
      },
    });
  }

  // 详细内容（如果有）
  if (content) {
    elements.push({
      tag: 'hr',
    });
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: content.length > 2000 ? '...' + content.slice(-2000) : content,
      },
    });
  }

  // 如果没有任何内容，添加占位
  if (elements.length === 0) {
    elements.push({
      tag: 'div',
      text: { tag: 'plain_text', content: '处理中...' },
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `${icon} ${title}` },
      template,
    },
    elements,
  };
}

/**
 * 构建结果卡片
 */
export function buildResultCard(content: string, success: boolean = true): object {
  // 处理 markdown 内容
  const processed = processMarkdownForLark(content);
  const elements: any[] = [];

  // 检测是否包含代码块，分离代码和文本
  const { textParts, codeParts } = separateCodeBlocks(processed);

  // 先添加文本部分
  if (textParts.length > 0) {
    const textContent = textParts.join('\n\n').trim();
    if (textContent) {
      elements.push({
        tag: 'markdown',
        content: truncateText(textContent, 2000),
      });
    }
  }

  // 添加代码块（使用飞书代码块样式）
  for (const code of codeParts) {
    if (elements.length > 0) {
      elements.push({ tag: 'hr' });
    }
    elements.push({
      tag: 'markdown',
      content: truncateText(code.content, 1500),
    });
  }

  // 如果没有内容，添加默认消息
  if (elements.length === 0) {
    elements.push({
      tag: 'div',
      text: { tag: 'plain_text', content: success ? '操作完成' : '操作失败' },
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: {
        tag: 'plain_text',
        content: success ? '✅ 完成' : '❌ 失败',
      },
      template: success ? 'green' : 'red',
    },
    elements,
  };
}

/**
 * 分离代码块和普通文本
 */
function separateCodeBlocks(content: string): {
  textParts: string[];
  codeParts: Array<{ lang: string; content: string }>;
} {
  const textParts: string[] = [];
  const codeParts: Array<{ lang: string; content: string }> = [];

  // 匹配代码块 ```lang\ncode\n```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // 代码块前的文本
    const textBefore = content.slice(lastIndex, match.index).trim();
    if (textBefore) {
      textParts.push(textBefore);
    }

    // 代码块 - 保留原始格式，不 trim 以保持 ASCII art 对齐
    const lang = match[1] || 'plain_text';
    const code = match[2];
    if (code.trim()) {
      // 使用 plain_text 确保等宽字体
      const effectiveLang = lang === 'text' ? 'plain_text' : lang;
      codeParts.push({
        lang: effectiveLang,
        content: '```' + effectiveLang + '\n' + code + '```',
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // 最后一段文本
  const remaining = content.slice(lastIndex).trim();
  if (remaining) {
    textParts.push(remaining);
  }

  return { textParts, codeParts };
}

/**
 * 截断文本，保留完整性
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n\n...(内容过长已截断)';
}

/**
 * 处理 Markdown 内容，转换飞书不支持的语法
 */
function processMarkdownForLark(content: string): string {
  let processed = content;

  // 1. 将 markdown 图片语法转换为普通链接（飞书卡片不支持 ![](url) 语法）
  // ![alt text](url) -> [alt text](url) 或 [图片](url)
  processed = processed.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt, url) => {
      const linkText = alt?.trim() || '图片';
      return `[${linkText}](${url})`;
    }
  );

  // 2. 检测是否包含表格
  if (processed.includes('|') && processed.includes('---')) {
    processed = convertMarkdownTables(processed);
  }

  return processed;
}

/**
 * 将 Markdown 表格转换为飞书友好的格式
 */
function convertMarkdownTables(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inTable = false;
  let headers: string[] = [];
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检测表格行
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());

      // 跳过分隔行 (|---|---|)
      if (cells.every(c => /^[-:]+$/.test(c))) {
        continue;
      }

      if (!inTable) {
        // 第一行是表头
        inTable = true;
        headers = cells;
      } else {
        // 数据行
        tableRows.push(cells);
      }
    } else {
      // 非表格行，先输出之前的表格
      if (inTable) {
        result.push(formatTableAsText(headers, tableRows));
        inTable = false;
        headers = [];
        tableRows = [];
      }
      result.push(line);
    }
  }

  // 处理末尾的表格
  if (inTable) {
    result.push(formatTableAsText(headers, tableRows));
  }

  return result.join('\n');
}

/**
 * 将表格格式化为文本列表
 */
function formatTableAsText(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '';

  const lines: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    lines.push(`**#${i}**`);
    for (let j = 0; j < headers.length && j < row.length; j++) {
      if (row[j] && row[j] !== '-') {
        lines.push(`  ${headers[j]}: ${row[j]}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
