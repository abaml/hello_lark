/**
 * 幂等处理器
 * 用于防止飞书事件重复推送导致的重复处理
 */

export class IdempotencyChecker {
  private processedIds: Map<string, number>;
  private ttlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.processedIds = new Map();
    this.ttlMs = ttlMs;

    // 定期清理过期的 ID
    setInterval(() => this.cleanup(), ttlMs);
  }

  /**
   * 检查并标记 ID
   * @returns true 如果是新 ID（应该处理），false 如果是重复 ID（应该跳过）
   */
  check(eventId: string): boolean {
    if (this.processedIds.has(eventId)) {
      return false;
    }
    this.processedIds.set(eventId, Date.now());
    return true;
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, timestamp] of this.processedIds) {
      if (now - timestamp > this.ttlMs) {
        this.processedIds.delete(id);
      }
    }
  }
}

// 单例导出
export const idempotencyChecker = new IdempotencyChecker();
