/**
 * 反馈信号收集
 * 识别并记录用户的正面/负面反馈
 */

import { getDatabase } from '../storage/db';
import { logger } from '../utils/logger';

export interface FeedbackSignal {
  type: 'positive' | 'negative' | 'neutral';
  source: 'explicit' | 'implicit';
  pattern?: string;
}

// 负面信号模式
const NEGATIVE_PATTERNS = [
  { pattern: /^(不对|错了|不是|wrong)/i, source: 'explicit' as const },
  { pattern: /^(重来|重新|再来|redo)/i, source: 'explicit' as const },
  { pattern: /^(太长了?|太短了?|太啰嗦)/i, source: 'explicit' as const },
  { pattern: /^(算了|没用|不行|废话)/i, source: 'explicit' as const },
  { pattern: /^(不是这个意思|理解错了)/i, source: 'explicit' as const },
  { pattern: /^(能不能|可不可以).*(简洁|短一点|直接)/i, source: 'implicit' as const },
];

// 正面信号模式
const POSITIVE_PATTERNS = [
  { pattern: /^(好的?|可以|对|正确|没问题)/i, source: 'explicit' as const },
  { pattern: /^(完美|太棒了|nice|great|perfect)/i, source: 'explicit' as const },
  { pattern: /^(谢谢|感谢|thx|thanks)/i, source: 'explicit' as const },
  { pattern: /^(就是这个|对了|bingo)/i, source: 'explicit' as const },
];

class FeedbackCollector {
  /**
   * 分析消息中的反馈信号
   */
  analyze(content: string): FeedbackSignal {
    const trimmed = content.trim();

    // 检查负面信号
    for (const { pattern, source } of NEGATIVE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { type: 'negative', source, pattern: pattern.source };
      }
    }

    // 检查正面信号
    for (const { pattern, source } of POSITIVE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { type: 'positive', source, pattern: pattern.source };
      }
    }

    return { type: 'neutral', source: 'implicit' };
  }

  /**
   * 记录反馈
   */
  record(
    sessionId: string,
    messageId: string | undefined,
    signal: FeedbackSignal,
    context?: string
  ): void {
    // 只记录非中性的反馈
    if (signal.type === 'neutral') return;

    const db = getDatabase();
    const now = Date.now();

    db.run(`
      INSERT INTO feedback (session_id, message_id, signal_type, signal_source, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [sessionId, messageId || null, signal.type, signal.source, context || null, now]);

    logger.debug('Feedback recorded', { sessionId, type: signal.type, source: signal.source });
  }

  /**
   * 获取反馈统计
   */
  getStats(days: number = 7): { positive: number; negative: number; total: number } {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const positive = db.query(`
      SELECT COUNT(*) as count FROM feedback
      WHERE signal_type = 'positive' AND created_at > ?
    `).get(since) as any;

    const negative = db.query(`
      SELECT COUNT(*) as count FROM feedback
      WHERE signal_type = 'negative' AND created_at > ?
    `).get(since) as any;

    return {
      positive: positive?.count || 0,
      negative: negative?.count || 0,
      total: (positive?.count || 0) + (negative?.count || 0),
    };
  }

  /**
   * 获取常见负面反馈模式
   */
  getTopNegativePatterns(limit: number = 5): Array<{ context: string; count: number }> {
    const db = getDatabase();

    const rows = db.query(`
      SELECT context, COUNT(*) as count
      FROM feedback
      WHERE signal_type = 'negative' AND context IS NOT NULL
      GROUP BY context
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      context: row.context,
      count: row.count,
    }));
  }
}

export const feedbackCollector = new FeedbackCollector();
