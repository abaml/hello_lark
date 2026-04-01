/**
 * 会话摘要提取器
 * 在会话结束/超时时，提取关键信息存入长期记忆
 */

import { getDatabase } from '../storage/db';
import { logger } from '../utils/logger';
import { runAgent } from '../agent/claude';
import type { Message } from '../session/types';

const SUMMARY_PROMPT = `你是一个记忆提取助手。请分析以下对话，提取值得长期记住的关键信息。

只提取以下类型的信息：
1. 用户明确表达的偏好（如"我喜欢..."、"以后..."）
2. 重要的技术决策或结论
3. 用户提到的重要事实（项目、工具、习惯）

对话内容：
{conversation}

请严格按 JSON 格式返回，不要有任何其他内容：
{"memories": ["记忆1", "记忆2"], "hasMemory": true}

如果对话中没有值得记住的信息，返回：
{"memories": [], "hasMemory": false}`;

export interface EpisodicMemory {
  id: number;
  sessionId: string | null;
  content: string;
  summary: string | null;
  memoryType: string;
  createdAt: number;
}

class SessionSummarizer {
  /**
   * 从对话中提取记忆
   */
  async extractMemories(
    sessionId: string,
    messages: Message[]
  ): Promise<string[]> {
    if (messages.length < 2) {
      return [];
    }

    // 构建对话文本
    const conversation = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`)
      .join('\n\n');

    const prompt = SUMMARY_PROMPT.replace('{conversation}', conversation);

    try {
      const result = await runAgent(prompt, { maxTurns: 1 });

      if (!result.success || !result.response) {
        logger.warn('Failed to extract memories', { error: result.error });
        return [];
      }

      const jsonMatch = result.response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.hasMemory || !Array.isArray(parsed.memories)) {
        return [];
      }

      // 保存到数据库
      for (const memory of parsed.memories) {
        this.saveEpisodicMemory(sessionId, memory);
      }

      logger.info('Memories extracted', {
        sessionId,
        count: parsed.memories.length,
      });

      return parsed.memories;
    } catch (error) {
      logger.error('Memory extraction failed', error as Error);
      return [];
    }
  }

  /**
   * 保存情景记忆
   */
  saveEpisodicMemory(sessionId: string, content: string): void {
    const db = getDatabase();
    const now = Date.now();

    db.run(`
      INSERT INTO long_term_memory (session_id, content, memory_type, created_at)
      VALUES (?, ?, 'episodic', ?)
    `, [sessionId, content, now]);
  }

  /**
   * 获取相关情景记忆（简单关键词匹配）
   */
  getRelevantMemories(keywords: string[], limit: number = 5): EpisodicMemory[] {
    const db = getDatabase();

    if (keywords.length === 0) {
      // 返回最近的记忆
      const rows = db.query(`
        SELECT id, session_id, content, summary, memory_type, created_at
        FROM long_term_memory
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit) as any[];

      return this.mapRows(rows);
    }

    // 构建 LIKE 条件
    const conditions = keywords.map(() => 'content LIKE ?').join(' OR ');
    const params = keywords.map(k => `%${k}%`);

    const rows = db.query(`
      SELECT id, session_id, content, summary, memory_type, created_at
      FROM long_term_memory
      WHERE ${conditions}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limit) as any[];

    return this.mapRows(rows);
  }

  /**
   * 提取消息中的关键词（简单实现）
   */
  extractKeywords(content: string): string[] {
    // 移除标点，分词，过滤短词
    const words = content
      .replace(/[，。！？、：；""''【】（）\s]+/g, ' ')
      .split(' ')
      .filter(w => w.length >= 2);

    // 去重并取前 5 个
    return [...new Set(words)].slice(0, 5);
  }

  private mapRows(rows: any[]): EpisodicMemory[] {
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      content: row.content,
      summary: row.summary,
      memoryType: row.memory_type,
      createdAt: row.created_at,
    }));
  }
}

export const sessionSummarizer = new SessionSummarizer();
