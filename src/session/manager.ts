/**
 * 会话管理器
 * 支持基于话题的 session 隔离，数据持久化到 SQLite
 */

import { logger } from '../utils/logger';
import { getDatabase } from '../storage/db';
import { sessionSummarizer } from '../memory';
import type { Session, SessionCreateOptions, Message } from './types';

const MAX_HISTORY_SIZE = 20; // 内存中保留的历史条数
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 小时无活动则从内存清理
const DEFAULT_WORK_DIR = process.env.CLAUDE_WORK_DIR || process.cwd();

/**
 * 生成 session key
 * 优先使用 rootId（话题），否则使用 chatId（主聊天）
 */
function getSessionKey(chatId: string, rootId?: string): string {
  return rootId ? `thread:${rootId}` : `chat:${chatId}`;
}

class SessionManager {
  private sessions: Map<string, Session>;

  constructor() {
    this.sessions = new Map();
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * 获取或创建会话
   */
  getOrCreate(options: SessionCreateOptions): Session {
    const { chatId, chatType, userId, rootId } = options;
    const sessionKey = getSessionKey(chatId, rootId);

    // 先检查内存
    let session = this.sessions.get(sessionKey);

    if (!session) {
      // 尝试从数据库加载
      const loaded = this.loadFromDatabase(sessionKey, chatId, chatType, rootId);
      session = loaded ?? undefined;

      if (!session) {
        // 创建新 session
        session = {
          id: sessionKey,
          chatId,
          chatType,
          rootId,
          lastUserId: userId,
          history: [],
          workDir: DEFAULT_WORK_DIR,
          lastActiveAt: Date.now(),
          createdAt: Date.now(),
        };
        this.saveSessionToDatabase(session);
        logger.debug('Session created', {
          sessionKey,
          chatId,
          rootId,
          isThread: !!rootId,
        });
      }

      this.sessions.set(sessionKey, session);
    }

    session.lastUserId = userId;
    session.lastActiveAt = Date.now();

    return session;
  }

  /**
   * 从数据库加载 session
   */
  private loadFromDatabase(
    sessionKey: string,
    chatId: string,
    chatType: 'p2p' | 'group',
    rootId?: string
  ): Session | null {
    const db = getDatabase();

    const row = db.query(`
      SELECT id, chat_id, chat_type, last_user_id, last_active_at, created_at
      FROM sessions WHERE id = ?
    `).get(sessionKey) as any;

    if (!row) return null;

    // 加载消息历史（最近 N 条）
    const messages = db.query(`
      SELECT role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(sessionKey, MAX_HISTORY_SIZE) as any[];

    const history: Message[] = messages.reverse().map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));

    logger.debug('Session loaded from database', { sessionKey, historyCount: history.length });

    return {
      id: row.id,
      chatId: row.chat_id,
      chatType: row.chat_type,
      rootId,
      lastUserId: row.last_user_id || '',
      history,
      workDir: DEFAULT_WORK_DIR,
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
    };
  }

  /**
   * 保存 session 到数据库
   */
  private saveSessionToDatabase(session: Session): void {
    const db = getDatabase();

    db.run(`
      INSERT OR REPLACE INTO sessions (id, chat_id, chat_type, last_user_id, last_active_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      session.chatId,
      session.chatType,
      session.lastUserId,
      session.lastActiveAt,
      session.createdAt,
    ]);
  }

  /**
   * 获取会话
   */
  get(sessionKey: string): Session | undefined {
    return this.sessions.get(sessionKey);
  }

  /**
   * 通过 chatId 和 rootId 获取会话
   */
  getByContext(chatId: string, rootId?: string): Session | undefined {
    const sessionKey = getSessionKey(chatId, rootId);
    return this.sessions.get(sessionKey);
  }

  /**
   * 添加消息到历史
   */
  addMessage(sessionKey: string, role: 'user' | 'assistant', content: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      logger.warn('Session not found', { sessionKey });
      return;
    }

    const timestamp = Date.now();

    // 添加到内存
    session.history.push({ role, content, timestamp });
    if (session.history.length > MAX_HISTORY_SIZE) {
      session.history = session.history.slice(-MAX_HISTORY_SIZE);
    }
    session.lastActiveAt = timestamp;

    // 持久化到数据库
    const db = getDatabase();
    db.run(`
      INSERT INTO messages (session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
    `, [sessionKey, role, content, timestamp]);

    // 更新 session 的 last_active_at
    db.run(`UPDATE sessions SET last_active_at = ? WHERE id = ?`, [timestamp, sessionKey]);
  }

  /**
   * 获取工作目录
   */
  getWorkDir(sessionKey: string): string {
    const session = this.sessions.get(sessionKey);
    return session?.workDir || DEFAULT_WORK_DIR;
  }

  /**
   * 检查主聊天是否有最近活跃的上下文
   */
  hasRecentContext(chatId: string): boolean {
    const sessionKey = getSessionKey(chatId);
    const session = this.sessions.get(sessionKey);
    if (!session) {
      // 检查数据库
      const db = getDatabase();
      const row = db.query(`
        SELECT last_active_at FROM sessions WHERE id = ?
      `).get(sessionKey) as any;

      if (!row) return false;

      const RECENT_THRESHOLD = 5 * 60 * 1000;
      return Date.now() - row.last_active_at < RECENT_THRESHOLD;
    }

    const RECENT_THRESHOLD = 5 * 60 * 1000;
    return Date.now() - session.lastActiveAt < RECENT_THRESHOLD;
  }

  /**
   * 清除会话（仅从内存，保留数据库记录）
   */
  clear(sessionKey: string): void {
    this.sessions.delete(sessionKey);
    logger.debug('Session cleared from memory', { sessionKey });
  }

  /**
   * 清理内存中过期的会话（不删除数据库记录）
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    const sessionsToSummarize: Session[] = [];

    for (const [key, session] of this.sessions) {
      if (now - session.lastActiveAt > SESSION_TIMEOUT_MS) {
        // 收集需要提取摘要的会话
        if (session.history.length >= 4) {
          sessionsToSummarize.push(session);
        }
        this.sessions.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Sessions cleaned from memory', { count: cleaned });
    }

    // 异步提取摘要（不阻塞清理）
    for (const session of sessionsToSummarize) {
      sessionSummarizer.extractMemories(session.id, session.history).catch(err => {
        logger.error('Failed to extract session memories', err);
      });
    }
  }

  /**
   * 清理数据库中的旧消息（可选，定期调用）
   */
  cleanupOldMessages(retentionDays: number = 30): void {
    const db = getDatabase();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const result = db.run(`DELETE FROM messages WHERE timestamp < ?`, [cutoff]);
    if (result.changes > 0) {
      logger.info('Old messages cleaned', { deleted: result.changes, retentionDays });
    }
  }

  /**
   * 获取所有活跃会话数量（内存中）
   */
  getActiveCount(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();

// 导出辅助函数
export { getSessionKey };
