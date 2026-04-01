/**
 * 记忆存储层（数据库持久化）
 */

import { getDatabase } from './db';
import { logger } from '../utils/logger';
import type { Session, Message } from '../session/types';

/**
 * 保存会话到数据库
 */
export function saveSession(session: Session): void {
  const db = getDatabase();

  db.run(`
    INSERT OR REPLACE INTO sessions
    (id, chat_id, chat_type, last_user_id, last_active_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    session.id,
    session.chatId,
    session.chatType,
    session.lastUserId,
    session.lastActiveAt,
    session.createdAt,
  ]);

  logger.debug('Session saved', { id: session.id });
}

/**
 * 加载会话
 */
export function loadSession(chatId: string): Session | null {
  const db = getDatabase();

  const row = db.query(`
    SELECT * FROM sessions WHERE chat_id = ?
  `).get(chatId) as any;

  if (!row) {
    return null;
  }

  // 加载消息历史
  const messages = loadMessages(row.id);

  return {
    id: row.id,
    chatId: row.chat_id,
    chatType: row.chat_type,
    lastUserId: row.last_user_id,
    history: messages,
    workDir: row.work_dir || process.cwd(),
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
  };
}

/**
 * 保存消息
 */
export function saveMessage(sessionId: string, message: Message): void {
  const db = getDatabase();

  db.run(`
    INSERT INTO messages (session_id, role, content, timestamp)
    VALUES (?, ?, ?, ?)
  `, [sessionId, message.role, message.content, message.timestamp]);

  logger.debug('Message saved', { sessionId, role: message.role });
}

/**
 * 加载消息历史
 */
export function loadMessages(sessionId: string, limit: number = 20): Message[] {
  const db = getDatabase();

  const rows = db.query(`
    SELECT role, content, timestamp FROM messages
    WHERE session_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(sessionId, limit) as any[];

  // 反转顺序（从旧到新）
  return rows.reverse().map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
    timestamp: row.timestamp,
  }));
}

/**
 * 保存长期记忆
 */
export function saveLongTermMemory(
  content: string,
  summary?: string,
  sessionId?: string,
  memoryType: string = 'episodic'
): number {
  const db = getDatabase();

  const result = db.run(`
    INSERT INTO long_term_memory (session_id, content, summary, memory_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [sessionId || null, content, summary || null, memoryType, Date.now()]);

  return Number(result.lastInsertRowid);
}

/**
 * 搜索长期记忆（简单关键词匹配）
 */
export function searchMemory(keyword: string, limit: number = 10): Array<{
  id: number;
  content: string;
  summary: string | null;
  memoryType: string;
  createdAt: number;
}> {
  const db = getDatabase();

  const rows = db.query(`
    SELECT id, content, summary, memory_type, created_at
    FROM long_term_memory
    WHERE content LIKE ? OR summary LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(`%${keyword}%`, `%${keyword}%`, limit) as any[];

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    summary: row.summary,
    memoryType: row.memory_type,
    createdAt: row.created_at,
  }));
}

/**
 * 清理旧消息（保留最近 N 条）
 */
export function cleanupOldMessages(sessionId: string, keepCount: number = 50): number {
  const db = getDatabase();

  // 获取要保留的消息的最小 ID
  const minIdRow = db.query(`
    SELECT id FROM messages
    WHERE session_id = ?
    ORDER BY timestamp DESC
    LIMIT 1 OFFSET ?
  `).get(sessionId, keepCount - 1) as any;

  if (!minIdRow) {
    return 0; // 消息数量不足，无需清理
  }

  const result = db.run(`
    DELETE FROM messages
    WHERE session_id = ? AND id < ?
  `, [sessionId, minIdRow.id]);

  const deleted = result.changes;
  if (deleted > 0) {
    logger.debug('Old messages cleaned', { sessionId, deleted });
  }

  return deleted;
}
