/**
 * 会话相关类型定义
 */

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Session {
  /** 内部会话 ID（基于 chatId 或 threadId 生成） */
  id: string;
  /** 飞书 chat_id */
  chatId: string;
  /** 聊天类型 */
  chatType: 'p2p' | 'group';
  /** 话题根消息 ID（如果是话题 session） */
  rootId?: string;
  /** 最后活跃的用户 ID */
  lastUserId: string;
  /** 对话历史 */
  history: Message[];
  /** 当前工作目录 */
  workDir: string;
  /** 最后活跃时间 */
  lastActiveAt: number;
  /** 创建时间 */
  createdAt: number;
}

export interface SessionCreateOptions {
  chatId: string;
  chatType: 'p2p' | 'group';
  userId: string;
  /** 话题根消息 ID */
  rootId?: string;
}
