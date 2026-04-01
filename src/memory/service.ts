/**
 * 记忆服务
 * 管理用户偏好和项目知识的存取
 */

import { getDatabase } from '../storage/db';
import { logger } from '../utils/logger';

export interface UserPreference {
  id: number;
  userId: string;
  key: string;
  value: string;
  confidence: number;
  source: 'explicit' | 'inferred';
  updatedAt: number;
}

export interface ProjectKnowledge {
  id: number;
  projectPath: string | null;
  key: string;
  value: string;
  updatedAt: number;
}

class MemoryService {
  /**
   * 保存用户偏好（显式记忆）
   */
  remember(userId: string, content: string): void {
    const db = getDatabase();
    const now = Date.now();

    // 使用内容本身作为 key（简化处理）
    // 后续可以用 AI 提取结构化的 key-value
    const key = this.extractKey(content);

    db.run(`
      INSERT INTO user_preferences (user_id, key, value, confidence, source, updated_at)
      VALUES (?, ?, ?, 1.0, 'explicit', ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        confidence = 1.0,
        source = 'explicit',
        updated_at = excluded.updated_at
    `, [userId, key, content, now]);

    logger.info('Memory saved', { userId, key: key.slice(0, 30) });
  }

  /**
   * 删除用户偏好
   */
  forget(userId: string, keyword: string): number {
    const db = getDatabase();

    // 模糊匹配删除
    const result = db.run(`
      DELETE FROM user_preferences
      WHERE user_id = ? AND (key LIKE ? OR value LIKE ?)
    `, [userId, `%${keyword}%`, `%${keyword}%`]);

    if (result.changes > 0) {
      logger.info('Memory deleted', { userId, keyword, count: result.changes });
    }

    return result.changes;
  }

  /**
   * 获取用户所有偏好
   */
  getUserPreferences(userId: string): UserPreference[] {
    const db = getDatabase();

    const rows = db.query(`
      SELECT id, user_id, key, value, confidence, source, updated_at
      FROM user_preferences
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(userId) as any[];

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      source: row.source,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * 获取项目知识
   */
  getProjectKnowledge(projectPath?: string): ProjectKnowledge[] {
    const db = getDatabase();

    let rows: any[];
    if (projectPath) {
      rows = db.query(`
        SELECT id, project_path, key, value, updated_at
        FROM project_knowledge
        WHERE project_path = ? OR project_path IS NULL
        ORDER BY updated_at DESC
      `).all(projectPath) as any[];
    } else {
      rows = db.query(`
        SELECT id, project_path, key, value, updated_at
        FROM project_knowledge
        ORDER BY updated_at DESC
      `).all() as any[];
    }

    return rows.map(row => ({
      id: row.id,
      projectPath: row.project_path,
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * 保存项目知识
   */
  saveProjectKnowledge(key: string, value: string, projectPath?: string): void {
    const db = getDatabase();
    const now = Date.now();

    db.run(`
      INSERT INTO project_knowledge (project_path, key, value, updated_at)
      VALUES (?, ?, ?, ?)
    `, [projectPath || null, key, value, now]);

    logger.info('Project knowledge saved', { key, projectPath });
  }

  /**
   * 构建记忆上下文（用于注入 prompt）
   */
  buildMemoryContext(userId: string, projectPath?: string): string {
    const preferences = this.getUserPreferences(userId);
    const knowledge = this.getProjectKnowledge(projectPath);

    logger.info('Building memory context', {
      userId,
      projectPath,
      preferencesCount: preferences.length,
      knowledgeCount: knowledge.length,
    });

    const parts: string[] = [];

    // 全局规则
    parts.push(`## 全局规则
- 遇到微信公众号链接 (mp.weixin.qq.com) 时，必须使用 chrome-mcp-server 的浏览器工具获取内容，因为 WebFetch 无法解析 JS 渲染的页面`);

    // 用户记忆（通过"记住：xxx"保存的长期记忆）
    if (preferences.length > 0) {
      const prefLines = preferences.map(p => `- ${p.value}`).join('\n');
      parts.push(`## 用户记忆
以下是用户保存的长期记忆，你必须优先遵守和参考这些约束：
${prefLines}`);
    }

    if (knowledge.length > 0) {
      const knowledgeLines = knowledge.map(k => `- ${k.key}: ${k.value}`).join('\n');
      parts.push(`## 项目知识\n${knowledgeLines}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 列出所有记忆（用于展示）
   */
  listMemories(userId: string): string {
    const preferences = this.getUserPreferences(userId);

    if (preferences.length === 0) {
      return '暂无记忆\n\n使用「记住：xxx」添加记忆';
    }

    const lines = preferences.map((p, i) => {
      const date = new Date(p.updatedAt).toLocaleDateString('zh-CN');
      return `${i + 1}. ${p.value}\n   (${date}, ${p.source === 'explicit' ? '显式' : '推断'})`;
    });

    return `📝 已保存的记忆:\n\n${lines.join('\n\n')}`;
  }

  /**
   * 从内容中提取 key（简化版，取前 50 字符的哈希）
   */
  private extractKey(content: string): string {
    // 简单处理：取前 50 字符作为 key
    return content.slice(0, 50).replace(/\s+/g, '_').toLowerCase();
  }
}

export const memoryService = new MemoryService();
