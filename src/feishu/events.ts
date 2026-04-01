/**
 * 飞书事件处理器
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import { logger } from '../utils/logger';
import { idempotencyChecker } from '../utils/idempotency';
import { larkClient } from './client';

export interface MessageEvent {
  eventId: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  senderId: string;
  messageId: string;
  messageType: string;
  content: string;
  mentions?: Array<{ id: string; name: string }>;
  /** 话题根消息 ID（如果在话题内） */
  rootId?: string;
  /** 父消息 ID（被直接回复的消息） */
  parentId?: string;
  /** 话题 ID */
  threadId?: string;
}

export type MessageHandler = (event: MessageEvent) => Promise<void>;

/**
 * 通过 API 获取 merge_forward 消息的实际内容
 */
async function fetchMergeForwardContent(messageId: string): Promise<string> {
  try {
    const response = await larkClient.im.v1.message.get({
      path: { message_id: messageId },
    });

    if (response.code !== 0) {
      logger.warn('Failed to get merge_forward message', { code: response.code, msg: response.msg });
      return '[转发消息]';
    }

    const items = response.data?.items || [];
    if (items.length === 0) {
      return '[转发消息]';
    }

    // 构建 sender id -> name 映射（从 mentions 中提取）
    const senderNames = new Map<string, string>();
    for (const item of items) {
      if (item.mentions) {
        for (const m of item.mentions) {
          if (m.id && m.name) {
            senderNames.set(m.id, m.name);
          }
        }
      }
    }

    const lines: string[] = ['[转发消息]'];

    for (const item of items) {
      // 跳过 merge_forward 容器本身
      if (item.msg_type === 'merge_forward') continue;

      const senderId = item.sender?.id || '';
      const senderName = senderNames.get(senderId) || senderId.slice(-6) || '未知';
      const msgContent = parseMessageItem(item);
      if (msgContent) {
        lines.push(`${senderName}: ${msgContent}`);
      }
    }

    return lines.join('\n');
  } catch (e) {
    logger.warn('Failed to fetch merge_forward', { error: e });
    return '[转发消息]';
  }
}

/**
 * 解析消息项内容
 */
function parseMessageItem(item: any): string {
  const msgType = item.msg_type;
  const content = item.body?.content;

  if (!content) return '';

  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;

    if (msgType === 'text' && parsed.text) {
      // 移除 @mention 占位符，替换为实际名字
      let text = parsed.text;
      if (item.mentions) {
        for (const m of item.mentions) {
          if (m.key && m.name) {
            text = text.replace(m.key, `@${m.name}`);
          }
        }
      }
      // 移除 HTML 标签
      text = text.replace(/<[^>]+>/g, '');
      return text;
    }
    if (msgType === 'image') {
      return '[图片]';
    }
    if (msgType === 'file') {
      return `[文件: ${parsed.file_name || '未知'}]`;
    }
    if (msgType === 'sticker') {
      return '[表情]';
    }

    return `[${msgType}]`;
  } catch {
    return `[${msgType}]`;
  }
}


/**
 * 创建事件分发器
 */
export function createEventDispatcher(onMessage: MessageHandler): Lark.EventDispatcher {
  const dispatcher = new Lark.EventDispatcher({});

  // 注册消息接收事件
  dispatcher.register({
    'im.message.receive_v1': async (data) => {
      const eventData = data as any;

      // 长连接模式：数据直接在 data 下，没有 event 包装
      // Webhook 模式：数据在 data.event 下
      const eventId = eventData.event_id ?? eventData.header?.event_id ?? `${Date.now()}`;

      // 幂等检查
      if (!idempotencyChecker.check(eventId)) {
        logger.debug('Duplicate event ignored', { eventId });
        return;
      }

      try {
        // 兼容两种模式
        const message = eventData.message ?? eventData.event?.message;
        const sender = eventData.sender ?? eventData.event?.sender;

        if (!message || !sender) {
          logger.warn('Invalid message event', { data });
          return;
        }

        // 解析消息内容
        let content = '';
        let mentions: Array<{ id: string; name: string }> | undefined;

        if (message.message_type === 'text') {
          const parsed = JSON.parse(message.content || '{}');
          content = parsed.text || '';

          // 提取 mentions
          if (message.mentions) {
            mentions = message.mentions.map((m: any) => ({
              id: m.id?.user_id || m.id?.open_id,
              name: m.name,
            }));

            // 移除消息中的 @mention 占位符
            content = content.replace(/@_user_\d+/g, '').trim();
          }
        } else if (message.message_type === 'merge_forward') {
          // 转发的会话记录，需要通过 API 获取实际内容
          content = await fetchMergeForwardContent(message.message_id);
        } else {
          // 非文本消息暂时只记录类型
          content = `[${message.message_type}]`;
        }

        const event: MessageEvent = {
          eventId,
          chatId: message.chat_id,
          chatType: message.chat_type === 'p2p' ? 'p2p' : 'group',
          senderId: sender.sender_id?.user_id || sender.sender_id?.open_id || 'unknown',
          messageId: message.message_id,
          messageType: message.message_type,
          content,
          mentions,
          rootId: message.root_id,
          parentId: message.parent_id,
          threadId: message.thread_id,
        };

        logger.info('Message received', {
          chatId: event.chatId,
          chatType: event.chatType,
          senderId: event.senderId,
          content: event.content.slice(0, 50),
        });

        await onMessage(event);
      } catch (error) {
        logger.error('Error handling message event', error as Error);
      }
    },
  });

  return dispatcher;
}
