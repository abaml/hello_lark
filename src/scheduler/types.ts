/**
 * 定时任务类型定义
 */

export interface ScheduledTask {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** Cron 表达式 (秒 分 时 日 月 周) */
  cron: string;
  /** 任务描述/Prompt */
  prompt: string;
  /** 目标飞书 chat_id */
  chatId: string;
  /** 是否启用 */
  enabled: boolean;
  /** 工作目录（可选） */
  workDir?: string;
  /** 上次执行时间 */
  lastRunAt?: number;
  /** 创建时间 */
  createdAt: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  response?: string;
  error?: string;
  executedAt: number;
}
